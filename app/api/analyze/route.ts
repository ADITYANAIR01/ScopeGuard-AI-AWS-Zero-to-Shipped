import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { marshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { extractText } from "unpdf";
import { bedrockClient, dynamoClient, s3Client } from "@/lib/aws";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_CONTRACT_CHARS = 120_000;
const MAX_REQUEST_CHARS = 8_000;
const MODEL_ID = "anthropic.claude-3-5-sonnet-20240620-v1:0";

type AnalysisResult = {
  isScopeCreep: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  violatedClause: string;
  analysis: string;
  estimatedExtraHours: number;
  suggestedEmailResponse: string;
};

function normalizeResult(value: unknown): AnalysisResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Bedrock returned an invalid result.");
  }

  const candidate = value as Record<string, unknown>;
  const risk = candidate.riskLevel;
  if (typeof candidate.isScopeCreep !== "boolean") throw new Error("Bedrock returned an invalid scope assessment.");
  if (risk !== "LOW" && risk !== "MEDIUM" && risk !== "HIGH") throw new Error("Bedrock returned an invalid risk level.");
  if (typeof candidate.violatedClause !== "string" || !candidate.violatedClause.trim()) throw new Error("Bedrock returned an invalid clause.");
  if (typeof candidate.analysis !== "string" || !candidate.analysis.trim()) throw new Error("Bedrock returned invalid analysis.");
  if (typeof candidate.suggestedEmailResponse !== "string" || !candidate.suggestedEmailResponse.trim()) {
    throw new Error("Bedrock returned an invalid response draft.");
  }

  const hours = candidate.estimatedExtraHours;
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0) {
    throw new Error("Bedrock returned an invalid estimate.");
  }

  return {
    isScopeCreep: candidate.isScopeCreep,
    riskLevel: risk,
    violatedClause: candidate.violatedClause.trim(),
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

    if (!clientRequest) return jsonError("Client request is required.", 400);
    if (clientRequest.length > MAX_REQUEST_CHARS) return jsonError("Client request is too long.", 400);

    let extractedContractText = rawContractText;
    let uploadedKey: string | undefined;
    let uploadedBuffer: Buffer | undefined;

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) return jsonError("PDF must be smaller than 10 MB.", 400);
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        return jsonError("Only PDF contracts are supported.", 400);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      uploadedBuffer = buffer;
      uploadedKey = `contracts/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      let extractedPdfText = "";
      try {
        const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
        extractedPdfText = (Array.isArray(text) ? text.join("\n") : text || "").trim();
      } catch (pdfError) {
        console.warn("PDF extraction failed, falling back to pasted contract text when available.", pdfError);
        extractedPdfText = "";
      }

      extractedContractText = extractedPdfText;
      if (!extractedContractText && rawContractText) {
        extractedContractText = rawContractText;
      }

      if (!extractedContractText) {
        return jsonError("Unable to extract contract text from the uploaded PDF. Paste the text or upload a readable PDF.", 400);
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
        ContentType: "application/pdf",
      }));
    }

    const systemPrompt = `You are ScopeGuard AI, a contract compliance analyst. Compare a Statement of Work against an incoming client request. Return only valid JSON, with no markdown, using exactly this schema: {"isScopeCreep": boolean, "riskLevel": "LOW" | "MEDIUM" | "HIGH", "violatedClause": string, "analysis": string, "estimatedExtraHours": number, "suggestedEmailResponse": string}. Cite the relevant SOW language in violatedClause when scope has changed. Be conservative: missing detail is not proof of scope creep.`;
    const userMessage = `STATEMENT OF WORK:\n${extractedContractText}\n\nINCOMING CLIENT REQUEST:\n${clientRequest}`;

    const response = await bedrockClient.send(new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: [{ role: "user", content: [{ text: userMessage }] }],
      inferenceConfig: { temperature: 0.1, maxTokens: 1500 },
    }));

    const responseText = response.output?.message?.content?.find((item) => item.text)?.text;
    if (!responseText) throw new Error("Bedrock returned an empty response.");
    const result = normalizeResult(parseJsonResponse(responseText));
    const logId = `LOG-${Date.now()}-${randomUUID()}`;

    await dynamoClient.send(new PutItemCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME || "ScopeLogs",
      Item: marshall({
        LogId: logId,
        Timestamp: new Date().toISOString(),
        IsScopeCreep: result.isScopeCreep,
        RiskLevel: result.riskLevel,
        ClientRequest: clientRequest.slice(0, 500),
        EstimatedHours: result.estimatedExtraHours,
        ContractKey: uploadedKey || "pasted-text",
      }),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analysis error", error);
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: `Failed to process scope evaluation: ${message}` }, { status: 500 });
  }
}
