# ScopeGuard AI — Zero to Shipped Submission AI Pack

> Feed this entire file to any AI to generate exact Builder Center submission text + screenshots. No guessing — all values are from this repo.

## 1. Machine-readable facts (copy as JSON to AI)

```json
{
  "project_name": "ScopeGuard AI",
  "tagline": "Stop giving away the work — extra-work detector for freelancers",
  "category": "Workplace efficiency",
  "category_tag": "#workplace-efficiency",
  "lane": "Startups",
  "lane_tag": "#startups",
  "stack": ["Next.js 15.5.26", "React 19", "TypeScript", "Tailwind CSS 4", "Node.js 22", "unpdf"],
  "aws_services": {
    "compute": "Amazon EC2 Amazon Linux 2023 t3.micro, Node 22 + PM2, port 3000, ap-south-1",
    "ai": "Amazon Bedrock Converse API, model moonshotai.kimi-k2.5, region us-east-1, temp 1.0, maxTokens 4000",
    "storage": "Amazon S3 scopeguard-contracts-assets, prefix contracts/, ap-south-1, SSE-S3, BlockPublicAccess, 24h lifecycle expire",
    "database": "Amazon DynamoDB ScopeLogs, PK LogId (S), PAY_PER_REQUEST, TTL on ExpiresAt (24h), ap-south-1",
    "iam": "ScopeGuard-EC2-Role + ScopeGuard-EC2-Profile, least-privilege, no static creds",
    "network": "ScopeGuard-SG sg-0437f09fe9091bd9e, 3000/tcp, VPC vpc-0ed6a380c2aef2f00",
    "ops": "SSM Session Manager, CloudWatch Logs"
  },
  "routes": {
    "landing": "/",
    "dashboard": "/dashboard",
    "api": "POST /api/analyze (multipart/form-data: contractFile?: PDF<=10MB, contractText?: <=120k chars, clientRequest: required <=8k chars)"
  },
  "api_response": {
    "isScopeCreep": true,
    "riskLevel": "HIGH | MEDIUM | LOW",
    "violatedClause": "string",
    "analysis": "string",
    "estimatedExtraHours": 24,
    "suggestedEmailResponse": "string"
  },
  "coding_agent": "OpenCode + Muse Spark (muse-spark-1.3-contributor-free), connected to AWS via AWS MCP run_script + aws login, documented in AWS-infra.md",
  "proof_artifacts": ["AWS-infra.md section 4 live state table", "aws sts get-caller-identity 121490076448", "s3 head-bucket", "dynamodb describe-table ScopeLogs ACTIVE", "bedrock-runtime converse moonshotai.kimi-k2.5 OK", "USER_DATA.sh EC2 bootstrap"],
  "placeholders_to_fill": {
    "LIVE_URL": "https://YOUR-EC2-PUBLIC-IP:3000 or https://yourdomain.com",
    "REPO_URL": "https://github.com/YOUR-USER/ScopeGuard-AI-AWS-Zero-to-Shipped",
    "BUILDER_CENTER_URL": "https://builder.aws.com/...",
    "DEMO_VIDEO_URL": "https://youtube.com/... (optional but boosts AI score)"
  }
}
```

## 2. Builder Center copy-paste fields (exact output)

### Title
```
ScopeGuard AI — Stop giving away the work
```

### Tagline (max 120 chars)
```
Extra-work detector for freelancers: SOW vs new ask, risk + reply in seconds on AWS
```

### Tags (must add both)
```
#workplace-efficiency #startups
```

### Short description (use verbatim)
```
ScopeGuard AI is a Next.js 15 app on Amazon EC2 that compares your client SOW (PDF or pasted text) against a new client request, calls Amazon Bedrock (moonshotai.kimi-k2.5 in us-east-1) to judge scope creep, stores PDFs in S3 (scopeguard-contracts-assets/contracts/) and audit logs in DynamoDB (ScopeLogs), and returns: Extra work Yes/No, Risk LOW/MEDIUM/HIGH, cited clause, why, extra hours, and a copy-ready client reply. Data auto-deletes in 24h (S3 lifecycle + DynamoDB TTL).
```

### Long description (use verbatim for AI scoring)
```
Problem: Freelancers, agencies, students and small businesses constantly get "just one more thing" requests that quietly blow scope with no pay.

What I shipped: Open /dashboard → upload SOW PDF (≤10MB) or paste text → paste the new ask → Check my request → get Extra work: Yes/No, Risk, Extra hours, Why, Cited clause, What to reply. Copy reply or download summary. Includes sample case + compressor links (iLovePDF/IHatePDF) + 10MB client-side check.

How it works: POST /api/analyze → unpdf.extractText → S3 PutObject contracts/<ts>-<file> [ap-south-1] → Bedrock Converse moonshotai.kimi-k2.5 [us-east-1, JSON-only, conservative] → validate normalizeResult → DynamoDB PutItem ScopeLogs with ExpiresAt=now+24h → JSON to browser.

Why AWS: EC2 (Next.js needs Node runtime, no Lambda/API-GW), S3 for contract retention, DynamoDB On-Demand for audit, Bedrock for reasoning, IAM role (no static keys), SG ScopeGuard-SG, SSM + CloudWatch for ops.

Coding agent: Built with OpenCode/Muse Spark connected to AWS console via AWS MCP (run_script). Agent generated USER_DATA.sh, IAM least-privilege policy, S3/DDB/EC2 playbook in AWS-infra.md, wired Bedrock model swap from retired Claude 3.5 Sonnet to kimi-k2.5, fixed normalizeResult bug (empty violatedClause on in-scope), added 24h privacy expiry, and verified lint+build+5 API smoke tests all-green.

Lane: Startups — path to SaaS for freelancers/agencies: paid change-order tracking, team workspaces, first users = freelancer communities.
Live app: LIVE_URL
Category: Workplace efficiency. Lane: Startups.
```

### Development process (use verbatim)
```
1. Scaffolded Next.js + analyzer UI (/ + /dashboard/analyzer.tsx)
2. Built POST /api/analyze: validate → pdf extract → S3 → Bedrock → validate → DDB → JSON
3. Connected agent to AWS: aws login → created S3+DDB+IAM+SG via CLI playbook (AWS-infra.md §3)
4. Hit Bedrock EOL (Claude 3.5 Sonnet retired) → agent migrated to moonshotai.kimi-k2.5, widened IAM, re-verified converse
5. Smoke tests: HIGH creep, LOW in-scope, 400s, real PDF → fixed violatedClause bug
6. Added 24h auto-delete (S3 lifecycle + DDB TTL + ExpiresAt) + plain-language copy
7. EC2 USER_DATA.sh ready, SG hardening + ALB/HTTPS noted as pre-prod TODOs
```

### How coding agent helped (use verbatim)
```
OpenCode/Muse Spark with AWS MCP did: infra-as-docs (AWS-infra.md generic pattern + planned params + CLI playbook + live state), IAM least-privilege JSON, S3/DDB/EC2 commands, Bedrock model migration + prompt hardening, bug fix in normalizeResult, privacy TTL wiring, USER_DATA.sh, and full verification (lint, build, /, /dashboard 200, 5 API cases). Proof: AWS-infra.md §4 run log + sts/s3/ddb/bedrock outputs.
```

## 3. Screenshots — exact shot list (6 required)

Take at 1440x900, Chrome, light, no devtools. Filenames exact.

1. `01-landing-hero.png` — Go to `/`. Show: "Stop giving away the work." + Check my request + Scope review/0042 card + "auto-deleted within 24 hours". This proves storytelling.
2. `02-dashboard-empty.png` — Go to `/dashboard`. Show: "Is this extra work?" + Upload agreement (PDF) + Paste what you agreed + client request box + empty state. Caption: "Paste agreement + new ask".
3. `03-dashboard-creep-high.png` — Use sample case or: SOW="5-page website", Request="Build new customer portal + login". Click Check. Show result: Extra work: Yes, HIGH, 80h, Cited clause, Why, What to reply + Copy + Download.
4. `04-dashboard-inscope-low.png` — Same SOW, Request="Fix typo on homepage headline". Show: Extra work: No, LOW, 0h, "N/A — within scope".
5. `05-aws-proof.png` — Split or 2 crops: (a) Terminal `aws sts get-caller-identity + s3 head-bucket + dynamodb describe-table ScopeLogs ACTIVE`, (b) AWS Console S3 `scopeguard-contracts-assets/contracts/` + DynamoDB `ScopeLogs` items with `ExpiresAt`. This proves agent-to-AWS connection + live AWS use.
6. `06-architecture.png` — Render README mermaid flowchart OR AWS-infra.md diagram. Show: Browser → Next.js :3000 (EC2) → S3 + Bedrock us-east-1 + DynamoDB. Caption with regions.

AI image prompt (only if you need a cover, do NOT fake UI):
```
"Flat editorial illustration, cream #f5f1e8 background, shield-check icon, freelancer desk with contract + chat bubble 'just one more portal?', arrow to 'Extra work: YES HIGH 80h', small AWS + Bedrock badges, no text typos"
```

## 4. Ship-gate checklist (must all be YES before submit)

- [ ] EC2 running `ScopeGuard-AI` t3.micro ap-south-1, PM2 `npm start`, port 3000 reachable
- [ ] LIVE_URL public, loads `/` in incognito, `/dashboard` 200, analyze works with sample
- [ ] S3 `scopeguard-contracts-assets` + DDB `ScopeLogs` in ap-south-1, IAM role attached
- [ ] Bedrock `moonshotai.kimi-k2.5` in us-east-1 converse OK
- [ ] Builder Center project has both tags + LIVE_URL + repo + screenshots 01-06 + video (optional)
- [ ] Original app, 18+, Builder Center profile, rules OK

## 5. One-shot AI prompt (feed to AI for final submission)

```
Using ONLY the JSON in §1 + verbatim texts in §2, generate: (1) Builder Center title/tagline/short/long/process/agent-help under limits, (2) 6 screenshot captions ≤140 chars each, (3) 30-sec demo script. Do not invent URLs, metrics, or AWS resources. Use LIVE_URL placeholder as-is. Category #workplace-efficiency, lane #startups. Tone: plain, freelancer-friendly, no jargon.
```
