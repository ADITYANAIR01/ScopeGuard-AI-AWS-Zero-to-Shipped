# AWS-infra.md — ScopeGuard AI

> Source of truth for AWS infrastructure. Generic pattern on top, ScopeGuard plan in middle, CLI used to create it, live state at bottom.
> Generated: 2026-10-01. Repo: `ScopeGuard-AI-AWS-Zero-to-Shipped`.
> App: Next.js 15 + Node.js, `POST /api/analyze` → `unpdf.extractText` → S3 `PutObject` → Bedrock Converse `anthropic.claude-3-5-sonnet-20240620-v1:0` → DynamoDB `PutItem` → JSON.

---

## 1. Generic Infra Pattern (reusable for any Next.js + Bedrock + S3 + DynamoDB on EC2)

Use this as a template for future apps. Replace `APP-` prefix and bucket/table names.

```
                        +------------------+
                        |   Developer / CI |
                        +--------+---------+
                                 | git push / scp / SSM
                                 v
+----------------------------------------------------------------------------------+
| VPC (default or dedicated, 1 public subnet minimum)                              |
|  +----------------------+      +----------------------+                          |
|  | Security Group       |      | EC2 (AL2023, t3.micro|                          |
|  | APP-SG               |----->| /t3.small, Node 20/22|                          |
|  | 22: admin IP only    |      | PM2 + Next.js :3000  |                          |
|  | 80/443: LB/rev-proxy |      | IAM Instance Profile |                          |
|  | 3000: private/VPC    |      | (no static creds)    |                          |
|  +----------------------+      +----+------+------+---+                          |
+------------------------------------+------+------+-------------------------------+
                                     |      |      |
                    +----------------+ +----+ +---------------+
                    |                |      |               |
                    v                v      v               v
             +-------------+  +------------+  +----------------+  +--------------+
             | S3 Bucket   |  | DynamoDB   |  | Bedrock        |  | CloudWatch   |
             | contracts/  |  | Audit logs |  | Converse API   |  | Logs/Metrics |
             | SSE-S3,     |  | On-Demand  |  | us-east-1 *    |  | /APP/*       |
             | BlockPublic |  | PK=LogId   |  | model access   |  | Alarms       |
             +-------------+  +------------+  +----------------+  +--------------+
* Bedrock is region-limited — call it in a supported region even if rest of stack is elsewhere.
```

### Generic building blocks

| Layer | Generic choice | Why |
|---|---|---|
| Compute | EC2 AL2023 + PM2, `t3.micro` dev / `t3.small` prod | Matches `USER_DATA.sh` model, no Lambda/API-GW per README |
| Network | Default VPC + 1 SG (`APP-SG`) | Zero-to-shipped simple; upgrade to ALB + private subnets later |
| AuthZ | EC2 IAM Role + Instance Profile, least-privilege inline policies | No `.env` creds on server; SDK uses role chain |
| Storage | S3 private, `BlockPublicAccess=true`, SSE-S3, lifecycle `contracts/*` | Raw PDFs retained, text extracted at runtime |
| Audit | DynamoDB On-Demand, string PK, TTL optional | Compact logs, no RCU/WCU planning |
| AI | Bedrock Converse API, pinned `modelId`, `temperature~0.1` | Structured JSON, conservative scope judgment |
| Ops | SSM Session Manager + CloudWatch Logs | No SSH keys, debuggable without opening 22 |

### Generic IAM least-privilege shape

```json
{
  "Bedrock": ["bedrock:InvokeModel", "bedrock:Converse*"],
  "S3": ["s3:PutObject", "s3:GetObject"],
  "DynamoDB": ["dynamodb:PutItem", "dynamodb:GetItem"],
  "SSM": ["AmazonSSMManagedInstanceCore"],
  "CloudWatch": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
}
```

Scope each to exact ARN (bucket/prefix, table, model ARN). Never `*`.

### Generic CLI creation order

1. S3 bucket → 2. DynamoDB table → 3. IAM role/policy/instance-profile → 4. Security Group → 5. EC2 (+ UserData) → 6. Enable Bedrock model access (console, cannot be CLI-granted) → 7. Verify (`s3api head-bucket`, `dynamodb describe-table`, `ec2 describe-instances`, `sts get-caller-identity`).

---

## 2. Planned Infra — ScopeGuard AI (this repo)

### 2.1 Parameters

| Key | Value | Source |
|---|---|---|
| `AWS_REGION` (main) | `ap-south-1` (Mumbai) | `.env.example`, `lib/aws.ts`, `USER_DATA.sh` |
| `AWS_BEDROCK_REGION` | `us-east-1` (N. Virginia) | `lib/aws.ts:6`, Bedrock model availability |
| `S3_BUCKET_NAME` | `scopeguard-contracts-assets` | `.env.example:3` |
| `S3_PREFIX` | `contracts/` | `app/api/analyze/route.ts:96` |
| `DYNAMODB_TABLE_NAME` | `ScopeLogs` | `.env.example:4` |
| DynamoDB PK | `LogId: S (string)` e.g. `LOG-...-<uuid>` | `route.ts:144-156` |
| DynamoDB billing | `PAY_PER_REQUEST` | No provisioned throughput needed |
| DynamoDB attributes logged | `LogId, Timestamp, IsScopeCreep(BOOL), RiskLevel(S), ClientRequest(S, truncated 500), EstimatedHours(N), ContractKey(S)` | `route.ts:146-157` |
| Bedrock model | `anthropic.claude-3-5-sonnet-20240620-v1:0` via `ConverseCommand`, `temp 0.1, maxTokens 1500` | `route.ts:15,131-139` |
| EC2 | `Amazon Linux 2023, t3.micro (dev) / t3.small (prod), Node 22, PM2, port 3000` | `USER_DATA.sh` |
| IAM Role | `ScopeGuard-EC2-Role` + profile `ScopeGuard-EC2-Profile` | New (not yet created) |
| Security Group | `ScopeGuard-SG` | New |
| Limits enforced in code | `PDF ≤10MB, contract ≤120k chars, request ≤8k chars` | `route.ts:12-14` |

### 2.2 Architecture (actual data flow)

```
Browser (/ + /dashboard)
  -> POST /api/analyze (multipart: contractFile?, contractText?, clientRequest)
  -> unpdf.extractText (plaintext, mergePages) — NOT raw PDF to AI
  -> S3 PutObject s3://scopeguard-contracts-assets/contracts/<ts>-<file> [ap-south-1]
  -> Bedrock Converse us-east-1 (system + "SOW:\n{text}\n\nREQUEST:\n{req}") -> JSON
  -> validate normalizeResult -> DynamoDB PutItem ScopeLogs [ap-south-1]
  -> JSON {isScopeCreep, riskLevel, violatedClause, analysis, estimatedExtraHours, suggestedEmailResponse} -> Browser
```

### 2.3 Security plan

- S3: `BlockPublicAccess=true`, `BucketEncryption SSE-S3 (AES256)`, no public policy, lifecycle: `contracts/*` → expire/transition after 365d (to be added post-MVP).
- DynamoDB: SSE default (AWS-owned), no PITR in dev, enable PITR in prod.
- EC2 SG: ingress `22/tcp` admin-IP only, `3000/tcp` VPC/LB only, `80/443` only if reverse-proxy on same host; egress all. IMDSv2 required.
- IAM: role trusts `ec2.amazonaws.com` only; inline policies scoped to bucket/prefix, table, and Bedrock model ARN in `us-east-1`.
- Secrets: no static keys; local dev uses `aws login` short-term creds; prod uses instance profile.
- Bedrock: model access must be granted in `us-east-1` console → Bedrock → Model access → enable Claude 3.5 Sonnet.

### 2.4 Cost sketch (Mumbai + N.Virginia, Oct 2026 list)

- EC2 `t3.micro` ~$7/mo, `t3.small` ~$15/mo + EBS 30GB ~$3/mo.
- S3: negligible (<$1/mo for PDFs) + PUT/Lifecycle.
- DynamoDB On-Demand: ~$1.25/M writes + storage, negligible at MVP volume.
- Bedrock Claude 3.5 Sonnet: ~$3/M input + $15/M output. Avg req `30k in + 1k out ≈ $0.105`. 1k req/mo ≈ $105.
- Dominant cost = Bedrock tokens, not infra.

---

## 3. AWS CLI Creation Playbook (idempotent — safe to re-run)

> Prereq: `aws --version >= 2.32`, then `aws login` (valid 12h). Region env: `export AWS_REGION=ap-south-1 BEDROCK_REGION=us-east-1 BUCKET=scopeguard-contracts-assets TABLE=ScopeLogs`.

```bash
# 0. Verify identity
aws sts get-caller-identity

# 1. S3 bucket (ap-south-1) + hardening
aws s3api create-bucket --bucket $BUCKET --region $AWS_REGION \
  --create-bucket-configuration LocationConstraint=$AWS_REGION 2>&1 || true
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket $BUCKET \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-versioning --bucket $BUCKET --versioning-configuration Status=Suspended

# 2. DynamoDB table ScopeLogs (ap-south-1, On-Demand, PK LogId S)
aws dynamodb create-table --table-name $TABLE \
  --attribute-definitions AttributeName=LogId,AttributeType=S \
  --key-schema AttributeName=LogId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --region $AWS_REGION 2>&1 || true
aws dynamodb wait table-exists --table-name $TABLE --region $AWS_REGION

# 3. IAM role for EC2 (least-privilege)
aws iam create-role --role-name ScopeGuard-EC2-Role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' 2>&1 || true
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
cat > /tmp/scopeguard-policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect":"Allow","Action":["bedrock:InvokeModel","bedrock:ConverseStream","bedrock:Converse"],
     "Resource":["arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0","arn:aws:bedrock:us-east-1:${ACCOUNT_ID}:inference-profile/*"]},
    {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject"],
     "Resource":["arn:aws:s3:::${BUCKET}/contracts/*"]},
    {"Effect":"Allow","Action":["dynamodb:PutItem","dynamodb:GetItem"],
     "Resource":["arn:aws:dynamodb:${AWS_REGION}:${ACCOUNT_ID}:table/${TABLE}"]}
  ]
}
JSON
aws iam put-role-policy --role-name ScopeGuard-EC2-Role \
  --policy-name ScopeGuard-App-Policy --policy-document file:///tmp/scopeguard-policy.json
aws iam attach-role-policy --role-name ScopeGuard-EC2-Role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore 2>&1 || true
aws iam create-instance-profile --instance-profile-name ScopeGuard-EC2-Profile 2>&1 || true
aws iam add-role-to-instance-profile --instance-profile-name ScopeGuard-EC2-Profile \
  --role-name ScopeGuard-EC2-Role 2>&1 || true

# 4. Security Group (default VPC)
VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)
aws ec2 create-security-group --group-name ScopeGuard-SG --description "ScopeGuard Next.js" \
  --vpc-id $VPC_ID --region $AWS_REGION 2>&1 || true
SG_ID=$(aws ec2 describe-security-groups --filters Name=group-name,Values=ScopeGuard-SG \
  --query 'SecurityGroups[0].GroupId' --output text --region $AWS_REGION)
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3000 --cidr 0.0.0.0/0 --region $AWS_REGION 2>&1 || true
# Harden later: replace 0.0.0.0/0:3000 with LB/VPN IP; add 22 from admin IP only.

# 5. EC2 (AL2023, t3.micro, UserData = USER_DATA.sh)
aws ec2 run-instances --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --instance-type t3.micro --security-group-ids $SG_ID \
  --iam-instance-profile Name=ScopeGuard-EC2-Profile \
  --user-data file://USER_DATA.sh --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=ScopeGuard-AI}]' \
  --region $AWS_REGION

# 6. Bedrock model access — CONSOLE ONLY (us-east-1): Bedrock -> Model access -> Enable Claude 3.5 Sonnet v1.
aws bedrock list-foundation-models --region $BEDROCK_REGION --query 'modelSummaries[?contains(modelId,`claude-3-5-sonnet`)].modelId' --output table || true

# 7. Verify
aws s3api head-bucket --bucket $BUCKET --region $AWS_REGION
aws dynamodb describe-table --table-name $TABLE --region $AWS_REGION --query 'Table.[TableName,TableStatus,BillingModeSummary.BillingMode]'
aws ec2 describe-security-groups --group-ids $SG_ID --region $AWS_REGION --query 'SecurityGroups[0].[GroupName,IpPermissions]'
```

---

## 4. Current Created Resources (live state — updated after each CLI run)

> Last run: `2026-10-01 ~11:02 IST (05:32 UTC) — Account 121490076448 (root). S3 + DDB + IAM + SG CREATED/ACTIVE. EC2 NOT launched (awaiting confirmation). Bedrock model EOL found.`

| Resource | Name / ID | Region | Status | Verified |
|---|---|---|---|---|
| S3 bucket | `scopeguard-contracts-assets` / `arn:aws:s3:::scopeguard-contracts-assets` | `ap-south-1` | ✅ created, `head-bucket OK`, PAB all-true, SSE AES256 | `aws s3api head-bucket --bucket scopeguard-contracts-assets --region ap-south-1` |
| DynamoDB table | `ScopeLogs` / `arn:aws:dynamodb:ap-south-1:121490076448:table/ScopeLogs` | `ap-south-1` | ✅ ACTIVE, On-Demand, PK `LogId (S)` | `aws dynamodb describe-table --table-name ScopeLogs --region ap-south-1` |
| IAM Role | `ScopeGuard-EC2-Role` / `arn:aws:iam::121490076448:role/ScopeGuard-EC2-Role` (`AROARYSK7OMQMP4NBJOG5`) | global | ✅ created + `ScopeGuard-App-Policy` + `AmazonSSMManagedInstanceCore` | `aws iam get-role + list-role-policies` |
| Instance Profile | `ScopeGuard-EC2-Profile` / `arn:aws:iam::121490076448:instance-profile/ScopeGuard-EC2-Profile` | global | ✅ created, role attached | `aws iam get-instance-profile` (implicit via add-role success) |
| Security Group | `ScopeGuard-SG` / `sg-0437f09fe9091bd9e` in `vpc-0ed6a380c2aef2f00` | `ap-south-1` | ✅ created, ingress `3000/tcp 0.0.0.0/0` (`sgr-058b79619cd157922`) — HARDEN before prod | `aws ec2 describe-security-groups --group-ids sg-0437f09fe9091bd9e` |
| EC2 instance | `ScopeGuard-AI` (`t3.micro`, AL2023) | `ap-south-1` | ⏳ NOT launched — needs explicit go-ahead (billable) | `aws ec2 describe-instances --filters Name=tag:Name,Values=ScopeGuard-AI` → empty |
| Bedrock model | `anthropic.claude-3-5-sonnet-20240620-v1:0` → ✅ now `moonshotai.kimi-k2.5` (`app/api/analyze/route.ts`, env `BEDROCK_MODEL_ID`) | `us-east-1` | ✅ ACTIVE + E2E converse OK (valid scope JSON). Old Claude EOL retired. | `aws bedrock-runtime converse --model-id moonshotai.kimi-k2.5 --region us-east-1` |

### Run log

- `2026-10-01 05:50 UTC`: `aws --version = 2.36.28` OK. `aws sts get-caller-identity` → `session expired`. No-op.
- `2026-10-01 05:52 UTC`: re-verified `sts + s3 head + ddb describe` — all `session expired`.
- `2026-10-01 ~05:30-05:33 UTC`: user approved `aws login` → `Updated profile default to arn:aws:iam::121490076448:root`. `sts get-caller-identity` OK.
- `2026-10-01 05:33 UTC`: `s3api create-bucket` OK (`Location: http://scopeguard-contracts-assets.s3.amazonaws.com/`). PAB OK, encryption OK.
- `2026-10-01 05:33 UTC`: `dynamodb create-table ScopeLogs` OK (CREATING) → `wait table-exists` OK → ACTIVE.
- `2026-10-01 05:33 UTC`: `iam create-role ScopeGuard-EC2-Role` OK, `put-role-policy ScopeGuard-App-Policy` OK, `attach AmazonSSMManagedInstanceCore` OK, `create-instance-profile + add-role` OK.
- `2026-10-01 05:33 UTC`: `ec2 create-security-group ScopeGuard-SG` OK (`sg-0437f09fe9091bd9e`), `authorize 3000/tcp 0.0.0.0/0` OK.
- `2026-10-01 05:34 UTC`: verify pass — S3/DDB/IAM/SG all OK. EC2 none running. Bedrock `list-foundation-models` OK but pinned `3-5-sonnet-20240620` EOL confirmed via `get-foundation-model`.
- `2026-10-01 ~04:44 UTC`: INTEGRATION — `route.ts: MODEL_ID anthropic.claude-3-5-sonnet-20240620-v1:0 → moonshotai.kimi-k2.5` (env-overridable via `BEDROCK_MODEL_ID`), `temperature 0.1→1.0`, `maxTokens 1500→4000`, system prompt hardened to `non-thinking, no trace, JSON only`. IAM `ScopeGuard-App-Policy` widened to `moonshot.kimi-k2-thinking + moonshotai.kimi-k2.5 + claude-sonnet-4-5 + claude-haiku-4-5 + inference-profile/*`. `.env.local` created (`AWS_REGION/BEDROCK_REGION/S3/DDB/MODEL_ID`). E2E: `s3 cp contracts/integration-test.txt OK`, `dynamodb put-item LOG-INTEGRATION-TEST OK`, `bedrock-runtime converse moonshotai.kimi-k2.5 OK` (returned valid `isScopeCreep/riskLevel/violatedClause` JSON). `npm run build` ✅ (Next 15.5.26, 6/6 pages).
- `2026-10-01 ~04:50 UTC`: SMOKE ALL-GREEN — `lint ✅, build ✅, / 200, /dashboard 200`. API: pasted-text creep → `HIGH 80h` ✅, in-scope typo fix → `false/LOW/0h` ✅ (after fix), missing-req/no-contract → `400` ✅, non-PDF → `400` ✅, real PDF upload → `HIGH 80h + S3 contracts/*.pdf + DDB LOG-*` ✅. BUG FOUND+FIXED: `normalizeResult` rejected empty `violatedClause` on in-scope results (Kimi returns `""`) → now `N/A — within scope` when `isScopeCreep=false`.
- `2026-10-01 ~05:00 UTC`: PRIVACY — frontend notice `Your data is secure and auto-deleted within 24 hours` added to landing (`page.tsx` hero + 3-col strip + footer) and dashboard (`analyzer.tsx` banner + upload hint + result footer). Infra: `S3 lifecycle contracts/* → Expire 1d + abort multipart` ✅, `DDB TTL ENABLED on ExpiresAt` ✅, `route.ts PutItem now writes ExpiresAt=now+24h` ✅, old logs backfilled, stray `integration-test.txt` deleted. Verified: new analyze call writes log with TTL; `build` ✅.
- `2026-10-01 ~05:10 UTC`: PLAIN-LANGUAGE COPY — landing (`Extra-work detector…`, `Paste your agreement…`, all CTAs → `Check my request`, privacy strip → `Locked…/Gone in 24h…/Never trains…`), analyzer (`Is this extra work?`, `Upload your agreement (PDF)`, `Paste what you agreed to do…`, results → `Extra work: Yes/No, Risk, Extra hours, Why, What to reply`, compressor links iLovePDF+IHatePDF with icons + client-side 10MB pre-check), server (`That file is too big…`, model errors → `Hmm, that answer didn't come out right…`). `lint ✅ build ✅`, copy verified in served HTML, oversize + normal analyze re-tested ✅.
- `2026-10-01 ~05:20 UTC`: VISUALS — dark mode (`ThemeToggle` + `data-theme` vars + pre-paint script, persisted, respects OS), premium (`animate-pop` result reveal, smooth theme fade, dark-tuned cards/bands/feedback), scroll cue (auto-scroll to answer + floating `Your answer is ready — see it` pill, auto-dismiss 9s). `lint ✅ build ✅`, toggle/script/cue verified in served HTML, analyze re-tested ✅.
- `2026-10-01 ~05:30 UTC`: DARK-MODE FIXES — ink buttons unreadable in dark (`hover:text-white` on light fill, `bg-ink+text-white` base) → `sg-btn-ink` flip; coral `#e07f70`→`#c65e51` for white-text contrast; tan hard-shadow → `sg-hardshadow`; pastel chip → `sg-chip`. Clean `rm -rf .next` build ✅ (earlier `/_error` flakes = stale cache + stray servers, not code). Served HTML re-verified, analyze ✅.

### How to resume (EC2 only — Bedrock fixed)

```bash
export AWS_REGION=ap-south-1 BEDROCK_REGION=us-east-1 BUCKET=scopeguard-contracts-assets TABLE=ScopeLogs
aws sts get-caller-identity  # must succeed
# EC2 — run only after explicit approval (starts billing):
# aws ec2 run-instances --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
#   --instance-type t3.micro --security-group-ids sg-0437f09fe9091bd9e \
#   --iam-instance-profile Name=ScopeGuard-EC2-Profile \
#   --user-data file://USER_DATA.sh --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=ScopeGuard-AI}]' \
#   --region $AWS_REGION
# Bedrock ✅ done: MODEL_ID=moonshotai.kimi-k2.5 (override via BEDROCK_MODEL_ID), IAM allows kimi + sonnet-4-5/haiku-4-5.
```

### Drift / action items

- ✅ Fixed: `MODEL_ID EOL → moonshotai.kimi-k2.5`, IAM widened, E2E verified.
- `package.json` uses `unpdf` (code) while `README` still mentions `pdf-parse` — doc-only drift.
- SG currently open `3000/tcp 0.0.0.0/0` — restrict to LB/admin IP + add `22` admin-only before prod.
- No S3 lifecycle, DynamoDB PITR, ALB/HTTPS, WAF/throttling — per skill Security Considerations, required before public exposure.
- Running as `root` (`arn:aws:iam::121490076448:root`) — create least-privilege IAM user/role with `SignInLocalDevelopmentAccess` for day-to-day; keep root for billing only.

