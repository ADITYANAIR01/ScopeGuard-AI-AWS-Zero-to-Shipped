import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { marshall } from "@aws-sdk/util-dynamodb";
import mammoth from "mammoth";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { extractText } from "unpdf";
import { bedrockClient, dynamoClient, s3Client } from "@/lib/aws";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_CONTRACT_CHARS = 120_000;
const MAX_REQUEST_CHARS = 8_000;
// Active Bedrock model (us-east-1, ON_DEMAND). Old claude-3-5-sonnet-20240620 is EOL.
// Kimi K2.5 runs in non-thinking JSON mode: requires temperature 1.0.
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "moonshotai.kimi-k2.5";

type AnalysisResult = {
  isScopeCreep: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  violatedClause: string;
  analysis: string;
  estimatedExtraHours: number;
  suggestedEmailResponse: string;
};

type ReplyTone = "firm" | "friendly" | "formal";

const TONE_INSTRUCTIONS: Record<ReplyTone, string> = {
  firm: "Write suggestedEmailResponse in a firm, direct tone. Be clear about boundaries and additional costs without sounding hostile.",
  friendly: "Write suggestedEmailResponse in a warm but straightforward tone. Be courteous, then clearly state what is extra work.",
  formal: "Write suggestedEmailResponse in a clear, businesslike tone. Reference the agreement terms precisely without legalistic or inflated language.",
};

function parseTone(value: unknown): ReplyTone {
  if (value === "firm" || value === "friendly" || value === "formal") return value;
  return "formal";
}

function parseUserId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeResult(value: unknown): AnalysisResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Bedrock returned an invalid result.");
  }

  const candidate = value as Record<string, unknown>;
  const risk = candidate.riskLevel;
  const isScopeCreep = candidate.isScopeCreep;
  if (typeof isScopeCreep !== "boolean") throw new Error("Bedrock returned an invalid scope assessment.");
  if (risk !== "LOW" && risk !== "MEDIUM" && risk !== "HIGH") throw new Error("Bedrock returned an invalid risk level.");
  // In-scope results legitimately have no violated clause — Kimi returns "".
  // Only require a citation when scope actually changed.
  let violatedClause = typeof candidate.violatedClause === "string" ? candidate.violatedClause.trim() : "";
  if (isScopeCreep && !violatedClause) throw new Error("Bedrock returned an invalid clause.");
  if (!violatedClause) violatedClause = "N/A — request is within agreed scope.";
  if (typeof candidate.analysis !== "string" || !candidate.analysis.trim()) throw new Error("Bedrock returned invalid analysis.");
  if (typeof candidate.suggestedEmailResponse !== "string" || !candidate.suggestedEmailResponse.trim()) {
    throw new Error("Bedrock returned an invalid response draft.");
  }

  const hours = candidate.estimatedExtraHours;
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0) {
    throw new Error("Bedrock returned an invalid estimate.");
  }

  return {
    isScopeCreep,
    riskLevel: risk,
    violatedClause,
    analysis: candidate.analysis.trim(),
    estimatedExtraHours: Math.round(hours * 10) / 10,
    suggestedEmailResponse: candidate.suggestedEmailResponse.trim(),
  };
}

function parseJsonResponse(text: string): unknown {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const cleaned = (fencedMatch?.[1] ?? text).trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) return JSON.parse(objectMatch[0]);
    throw new Error("Bedrock returned malformed JSON.");
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("contractFile");
    const rawContractValue = formData.get("contractText");
    const clientRequestValue = formData.get("clientRequest");
    const rawContractText = typeof rawContractValue === "string" ? rawContractValue.trim() : "";
    const clientRequest = typeof clientRequestValue === "string" ? clientRequestValue.trim() : "";
    const tone = parseTone(formData.get("tone"));
    const userId = parseUserId(formData.get("userId"));

    if (!clientRequest) return jsonError("Client request is required.", 400);
    if (clientRequest.length > MAX_REQUEST_CHARS) return jsonError("Client request is too long.", 400);

    let extractedContractText = rawContractText;
    let uploadedKey: string | undefined;
    let uploadedBuffer: Buffer | undefined;
    let uploadedContentType = "application/pdf";

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) return jsonError("That file is too big — try under 10 MB.", 400);
      const lowerName = file.name.toLowerCase();
      const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
      const isDocx =
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        lowerName.endsWith(".docx");
      if (!isPdf && !isDocx) {
        return jsonError("Only PDF or DOCX contracts are supported.", 400);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      uploadedBuffer = buffer;
      uploadedContentType = isDocx
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";
      uploadedKey = `contracts/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      let extractedFileText = "";
      try {
        if (isDocx) {
          const { value } = await mammoth.extractRawText({ buffer });
          extractedFileText = (value || "").trim();
        } else {
          const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
          extractedFileText = (Array.isArray(text) ? text.join("\n") : text || "").trim();
        }
      } catch (extractError) {
        console.warn("Contract extraction failed, falling back to pasted contract text when available.", extractError);
        extractedFileText = "";
      }

      extractedContractText = extractedFileText;
      if (!extractedContractText && rawContractText) {
        extractedContractText = rawContractText;
      }

      if (!extractedContractText) {
        return jsonError("Unable to extract contract text from the uploaded file. Paste the text or upload a readable PDF or DOCX.", 400);
      }
    }

    if (!extractedContractText) return jsonError("No contract text or PDF provided.", 400);
    if (extractedContractText.length > MAX_CONTRACT_CHARS) {
      return jsonError("Contract text is too long.", 400);
    }

    if (uploadedKey && uploadedBuffer) {
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME || "scopeguard-contracts-assets",
        Key: uploadedKey,
        Body: uploadedBuffer,
        ContentType: uploadedContentType,
      }));
    }

    const systemPrompt = `You are ScopeGuard AI, a contract compliance analyst. Compare a Statement of Work against an incoming client request. Use non-thinking mode. Return only valid JSON, with no markdown, no thinking trace, using exactly this schema: {"isScopeCreep": boolean, "riskLevel": "LOW" | "MEDIUM" | "HIGH", "violatedClause": string, "analysis": string, "estimatedExtraHours": number, "suggestedEmailResponse": string}.

  Use plain language that a freelancer can understand quickly. Be specific and concise:
  - violatedClause: quote or closely paraphrase only the relevant agreement language, in 1-3 sentences.
  - analysis: explain the decision in 2-4 short sentences. Name each requested change that affects scope, but do not restate the whole request.
  - estimatedExtraHours: give a rough, honest estimate. Do not imply false precision.
  - suggestedEmailResponse: write a ready-to-send reply in 3-5 short sentences. State what is outside the current agreement and suggest the next step. You may mention meetings, timelines, budgets, or project history when they are stated in the agreement or incoming request, but do not invent or assume them. Avoid exclamation marks, sales language, corporate jargon, and phrases such as "meaningful architectural extensions", "whatever best supports", or "get something on the books".

  Be conservative: missing detail is not proof of scope creep. Cite the relevant SOW language in violatedClause when scope has changed. ${TONE_INSTRUCTIONS[tone]}`;
    const userMessage = `STATEMENT OF WORK:\n${extractedContractText}\n\nINCOMING CLIENT REQUEST:\n${clientRequest}`;

    const response = await bedrockClient.send(new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: [{ role: "user", content: [{ text: userMessage }] }],
      inferenceConfig: { temperature: 1.0, maxTokens: 4000 },
    }));

    const responseText = response.output?.message?.content?.find((item) => item.text)?.text;
    if (!responseText) throw new Error("Bedrock returned an empty response.");
    const result = normalizeResult(parseJsonResponse(responseText));
    const logId = `LOG-${Date.now()}-${randomUUID()}`;
    // Auto-expire audit logs within 24h (DynamoDB TTL on ExpiresAt).
    const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

    await dynamoClient.send(new PutItemCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME || "ScopeLogs",
      Item: marshall({
        LogId: logId,
        Timestamp: new Date().toISOString(),
        // Anonymous per-browser owner. History reads filter on this so a
        // user only ever sees their own logs. Logs without UserId (legacy)
        // are never returned by /api/history.
        UserId: userId || "anonymous",
        Tone: tone,
        IsScopeCreep: result.isScopeCreep,
        RiskLevel: result.riskLevel,
        ClientRequest: clientRequest.slice(0, 500),
        EstimatedHours: result.estimatedExtraHours,
        ContractKey: uploadedKey || "pasted-text",
        ExpiresAt: expiresAt,
      }),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analysis error", error);
    const message = error instanceof Error ? error.message : "Unknown server error";
    // Keep internals in logs; users get plain words.
    const friendly = /bedrock|malformed|invalid|empty response/i.test(message)
      ? "Hmm, that answer didn't come out right. Try again with a smaller file or compress your PDF."
      : message;
    return NextResponse.json({ error: `Failed to process scope evaluation: ${friendly}` }, { status: 500 });
  }
}
