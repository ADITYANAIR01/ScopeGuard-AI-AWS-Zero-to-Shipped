# ScopeGuard AI — Zero to Shipped submission AI pack

## 1. Builder Center copy-paste fields

### Title

```text
ScopeGuard AI — Stop giving away the work
```

### Tagline (max 120 chars)

```text
Extra-work detector for freelancers: SOW vs new ask, risk + reply in seconds on AWS
```

### Tags (must add both)

```text
#workplace-efficiency #startups
```

### Short description

```text
ScopeGuard AI helps freelancers quickly spot scope creep by comparing what was agreed with a new client request. Get a clear Extra work Yes/No decision, risk level, supporting clause, estimated extra hours, and a copy-ready reply. Live at https://scopeguard.adityanair.tech.
```

### Long description

```text
Problem: Freelancers, agencies, students and small businesses constantly get "just one more thing" requests that quietly blow scope with no pay.

What I shipped: Open https://scopeguard.adityanair.tech/dashboard → upload an SOW PDF or DOCX (≤10MB) or paste text → paste the new ask → Check my request → get Extra work: Yes/No, Risk, Extra hours, Why, Cited clause, What to reply. Copy reply or download summary. Includes sample case + compressor links (iLovePDF/IHatePDF) + client-side 10MB validation. Dark mode included.

How it works: Browser → ALB :443 → ASG EC2 (Next.js :3000) → POST /api/analyze → unpdf/mammoth extract → S3 PutObject contracts/<ts>-<file> [ap-south-1] → Bedrock Converse moonshotai.kimi-k2.5 [us-east-1, JSON-only, conservative] → validation + normalizeResult → DynamoDB PutItem ScopeLogs with ExpiresAt=now+24h → JSON to browser.

Why AWS: ALB (HTTPS, health checks) + ASG (1 On-Demand + Spot overflow, CPU 70%) for cheap resilience, S3 for contract retention, DynamoDB On-Demand for audit, Bedrock for reasoning, IAM roles (no static keys), dedicated VPC with free S3/DDB endpoints and no NAT to reduce cost, ACM + CloudWatch for operations. The stack is documented in AWS-infra.md and codified in infra/scopeguard.yaml.

Coding agent: Built with OpenCode/Muse Spark connected to AWS via CLI. The agent created the dedicated VPC, S3 + DDB + IAM + ALB + ASG via an idempotent playbook, migrated Bedrock from the retired Claude 3.5 Sonnet path to `moonshotai.kimi-k2.5`, fixed the `normalizeResult` bug (empty `violatedClause` on in-scope results), wired 24h privacy expiry, cut over the custom domain with ACM HTTPS, built the OIDC GitHub Actions pipeline, and verified lint, build, and live HTTPS smoke tests.

Lane: Startups — path to SaaS for freelancers/agencies: paid change-order tracking, team workspaces, and first users from freelancer communities.
Live app: https://scopeguard.adityanair.tech
Category: Workplace efficiency. Lane: Startups.
```

### Development process

```text
1. Scaffolded the Next.js + analyzer UI at / and /dashboard
2. Built POST /api/analyze: validate → extract (unpdf/mammoth) → S3 → Bedrock → validate → DDB → JSON
3. Connected the coding agent to AWS via CLI: v1 stack (S3 + DDB + IAM + SG) using the playbook in AWS-infra.md
4. Hit Bedrock EOL on the older Claude path and migrated to moonshotai.kimi-k2.5 while widening IAM and re-verifying the Converse API
5. Smoke-tested HIGH creep, LOW in-scope, 400 validation errors, and a real PDF upload; fixed the violatedClause bug
6. Added 24h auto-delete (S3 lifecycle + DDB TTL + ExpiresAt) plus clearer copy and dark mode
7. Rebuilt the app as v2: dedicated VPC (no NAT) + ALB + ASG mixed On-Demand/Spot + CPU 70% + CloudFormation template
8. Cut over scopeguard.adityanair.tech (registrar CNAMEs, ACM issued, :443 + 80→443 redirect)
9. Added GitHub Actions OIDC pipeline (lint + build, instance refresh + live HTTPS verify) — the first deploy is green
```

### How coding agent helped

```text
OpenCode/Muse Spark with AWS CLI access did: infra-as-docs (AWS-infra.md locked architecture + CLI playbook + live state with every ID and ARN), IAM least-privilege policies (app + GitHub OIDC), VPC/ALB/ASG/ACM commands, Bedrock model migration + prompt hardening, normalizeResult bug fix, privacy TTL wiring, USER_DATA.sh, domain cutover (certificate request, validation records, HTTPS listeners), the full GitHub Actions workflow, the CloudFormation template, and verification at each stage (lint, build, target group healthy, HTTPS 200s, E2E analyze). Proof: AWS-infra.md §8 live state + `sts`/`elbv2`/`autoscaling`/`acm` outputs + green Actions run.
```

## 2. Screenshot list (7 required)

Take at 1440x900 in Chrome with light mode, no devtools. Filenames must match exactly.

1. `01-landing-hero.png` — Go to `https://scopeguard.adityanair.tech/`. Show “Stop giving away the work.”, the **Check my request** CTA, the scope review card, and the “auto-deleted within 24 hours” label. This proves the live domain is active.
2. `02-dashboard-empty.png` — Go to `/dashboard`. Show “Is this extra work?” with upload agreement, pasted contract text, and client request boxes in an empty state. Caption: “Paste agreement + new ask”.
3. `03-dashboard-creep-high.png` — Use the sample case or a real SOW like “5-page website”; the client request says “Build a customer portal + login.” Click **Check**. Show result: Extra work: Yes, HIGH, 80h, cited clause, why, what to reply, and copy/download controls.
4. `04-dashboard-inscope-low.png` — Same SOW, request: “Fix typo on homepage headline.” Show result: Extra work: No, LOW, 0h, “N/A — within scope”.
5. `05-aws-proof.png` — Include both: (a) terminal output from `aws elbv2 describe-load-balancers --names scopeguard-alb`, `aws autoscaling describe-auto-scaling-groups`, and `aws acm describe-certificate`; (b) EC2 target group showing `scopeguard-tg` with 2/2 healthy. This proves AWS use and agent-to-AWS connectivity.
6. `06-architecture.png` — Diagram: Browser → ALB :443 → ASG (OD + Spot) :3000 → S3 + Bedrock us-east-1 + DynamoDB in the ap-south-1 VPC (`10.20.0.0/16`). Include region labels.
7. `07-actions-green.png` — GitHub Actions run “ScopeGuard CI/CD” fully green with the verify step showing `DEPLOY OK`. This proves the pipeline ships changes to the live app.

AI image prompt (only if needed for a cover; do not fake the UI):

```text
"Flat editorial illustration, cream #f5f1e8 background, shield-check icon, freelancer desk with contract + chat bubble 'just one more portal?', arrow to 'Extra work: YES HIGH 80h', small AWS + Bedrock badges, no text typos"
```

## 3. Ship-gate checklist

- [x] ALB `scopeguard-alb` active, `https://scopeguard.adityanair.tech/` 200, `/dashboard` 200, analyze E2E valid JSON
- [x] ASG `scopeguard-asg` 1/2/4, TG `scopeguard-tg` 2/2 healthy, ACM issued, :80→443 redirect
- [x] S3 `scopeguard-contracts-assets` (lifecycle 1d) + DDB `ScopeLogs` (TTL) in `ap-south-1`, IAM roles attached
- [x] Bedrock `moonshotai.kimi-k2.5` in `us-east-1` converse OK
- [x] GitHub Actions pipeline green, CloudFormation `infra/scopeguard.yaml` validate-template OK
- [ ] Builder Center project has both tags, live URL, repo, screenshots 01–07, and optionally a demo video
- [ ] Original app, 18+, Builder Center profile, and rules are all valid

## 4. One-shot AI prompt

```text
Using ONLY the JSON in §1 and the verbatim text in §2, generate: (1) Builder Center title/tagline/short/long/process/agent-help under limits, (2) 7 screenshot captions ≤140 chars each, and (3) a 30-second demo script. Do not invent URLs, metrics, or AWS resources. Live URL is https://scopeguard.adityanair.tech. Category #workplace-efficiency, lane #startups. Tone: plain, freelancer-friendly, no jargon.
```

> Feed this entire file to any AI to generate submission text and screenshot captions. Use only repo data and the live AWS state, not guesses.

## 5. Machine-readable facts

```json
{
  "project_name": "ScopeGuard AI",
  "tagline": "Stop giving away the work — extra-work detector for freelancers",
  "category": "Workplace efficiency",
  "category_tag": "#workplace-efficiency",
  "lane": "Startups",
  "lane_tag": "#startups",
  "live_url": "https://scopeguard.adityanair.tech",
  "repo_url": "https://github.com/ADITYANAIR01/ScopeGuard-AI-AWS-Zero-to-Shipped",
  "stack": ["Next.js 15.5.26", "React 19", "TypeScript", "Tailwind CSS 4", "Node.js 22", "unpdf", "mammoth"],
  "aws_services": {
    "network": "Dedicated VPC ScopeGuard-VPC (10.20.0.0/16) with two public subnets, an IGW, and free S3/DDB Gateway Endpoints",
    "entry": "ALB scopeguard-alb with :443 HTTPS and :80 redirect to :443; forwards to the scopeguard-tg target group",
    "compute": "ASG scopeguard-asg with min 1 / desired 2 / max 4, mixed On-Demand + Spot, target tracking at CPU 70%",
    "ai": "Amazon Bedrock Converse API using moonshotai.kimi-k2.5 in us-east-1",
    "storage": "Amazon S3 bucket scopeguard-contracts-assets in ap-south-1 with lifecycle expiry for contracts/",
    "database": "Amazon DynamoDB ScopeLogs in ap-south-1 with PAY_PER_REQUEST billing and ExpiresAt TTL",
    "iam": "EC2 instance profile with least-privilege permissions and no static credentials",
    "ops": "SSM Session Manager and CloudWatch log group /ScopeGuard/app"
  },
  "cicd": "GitHub Actions pipeline with lint + build + ASG rolling deploy and live HTTPS verification",
  "iac": "CloudFormation stack in infra/scopeguard.yaml codifies the v2 deployment",
  "routes": {
    "landing": "/",
    "dashboard": "/dashboard",
    "api": "POST /api/analyze (multipart/form-data: contractFile?: PDF/DOCX <=10MB, contractText?: <=120k chars, clientRequest: required <=8k chars)"
  },
  "api_response": {
    "isScopeCreep": true,
    "riskLevel": "HIGH | MEDIUM | LOW",
    "violatedClause": "string",
    "analysis": "string",
    "estimatedExtraHours": 24,
    "suggestedEmailResponse": "string"
  },
  "coding_agent": "OpenCode + Muse Spark connected to AWS via AWS CLI and documented in AWS-infra.md",
  "proof_artifacts": [
    "AWS-infra.md live-state section",
    "aws sts get-caller-identity output",
    "ALB https://scopeguard.adityanair.tech 200 + E2E analyze valid JSON",
    "ASG 1/2/4 + ACM issued + target group healthy",
    "GitHub Actions green deploy run",
    "infra/scopeguard.yaml validate-template OK"
  ]
}
```
