# AWS-infra.md — ScopeGuard AI (v2 LOCKED)

> Source of truth for AWS infrastructure. Locked architecture on top, CLI playbook in middle, live created state at bottom.
> Generated: 2026-10-01. Repo: `ScopeGuard-AI-AWS-Zero-to-Shipped`.
> App: Next.js 15 + Node.js, `POST /api/analyze` → `unpdf.extractText`/`mammoth` → S3 `PutObject` → Bedrock Converse `moonshotai.kimi-k2.5` (us-east-1) → DynamoDB `PutItem` → JSON.
> Stateless: no local disk/session; history is browser localStorage. Any instance serves any request.

---

## 1. Locked Architecture

```
https://scopeguard.adityanair.tech (CNAME added by YOU after infra up — deferred)
  |
  v (HTTP now, HTTPS after ACM validated)
ALB scopeguard-alb [public-1a/1b, ScopeGuard-ALB-SG :80/:443 open]
  -> TG scopeguard-tg HTTP:3000 health GET / (no stickiness, no throttling, no WAF)
  -> ASG scopeguard-asg [public-1a/1b via IGW, ScopeGuard-App-SG :3000 from ALB-SG only]
      LT scopeguard-lt: AL2023 + Node22 + PM2 + next start :3000, IMDSv2, SSM
      1x t3.micro On-Demand (base, always on)
    + 1-3x Spot t3.micro/t3.small capacity-optimized (overflow)
      IAM: ScopeGuard-EC2-Role (S3 contracts/*, DDB ScopeLogs, Bedrock Kimi us-east-1)
      |
      +-> S3 scopeguard-contracts-assets [Gateway Endpoint, free]
      +-> DDB ScopeLogs [Gateway Endpoint, free]
      +-> Bedrock us-east-1 moonshotai.kimi-k2.5 [via IGW — no NAT]
      +-> CloudWatch /ScopeGuard/app
```

Locked decisions: dedicated VPC `10.20.0.0/16`, public-only (NO NAT — saves ~$32/mo), NO WAF, NO rate-limiting, NO CloudFront, NO Route53 zone (DNS stays at .tech registrar), ASG `min 1 / desired 2 / max 4` + target-tracking `CPU 70%`.

Why no NAT works: ASG lives in public subnets with public IP + IGW route. S3/DDB go via free Gateway Endpoints. Bedrock (us-east-1, cross-region, no VPC endpoint possible from ap-south-1) goes via IGW. Isolation is via SGs, not subnet type.

---

## 2. Parameters

| Key | Value | Source |
|---|---|---|
| `AWS_REGION` (main) | `ap-south-1` | `.env.example`, `lib/aws.ts`, `USER_DATA.sh` |
| `AWS_BEDROCK_REGION` | `us-east-1` | `lib/aws.ts:6` |
| `S3_BUCKET_NAME` | `scopeguard-contracts-assets` | `.env.example` |
| `S3_PREFIX` | `contracts/` | `app/api/analyze/route.ts:135` |
| `DYNAMODB_TABLE_NAME` | `ScopeLogs` | `.env.example` |
| DDB PK / billing / TTL | `LogId (S)` / `PAY_PER_REQUEST` / `ExpiresAt` (24h) | `route.ts:196-217` |
| Bedrock model | `moonshotai.kimi-k2.5` via `ConverseCommand`, `temp 1.0, maxTokens 4000`, env `BEDROCK_MODEL_ID` | `route.ts:18,186-191` |
| Compute | `AL2023 x86_64, Node 22, PM2, next start :3000, 30GB gp3` | `USER_DATA.sh` + LT |
| ASG | `min 1 / desired 2 / max 4`, `ELB` health, 300s grace, `CPU 70%` target-tracking | `scopeguard-asg` + `scopeguard-cpu70` |
| Capacity | `OnDemandBase=1, OnDemandAbove=0%, Spot=capacity-optimized, overrides [t3.micro, t3.small]` | MixedInstancesPolicy |
| Domain | `scopeguard.adityanair.tech` → `CNAME → ALB-DNS` (YOU, deferred) | Registrar (.tech, not Route53) |
| ACM | `scopeguard.adityanair.tech` in `ap-south-1`, DNS validation `PENDING` | ACM |
| Limits in code | `PDF/DOCX ≤10MB, contract ≤120k chars, request ≤8k chars` | `route.ts:13-15` |

---

## 3. Network (dedicated VPC, no NAT)

- VPC `ScopeGuard-VPC` `10.20.0.0/16`, DNS support + hostnames on.
- Subnets (both `MapPublicIpOnLaunch=true`): `public-1a 10.20.1.0/24 (ap-south-1a)`, `public-1b 10.20.2.0/24 (ap-south-1b)`.
- `ScopeGuard-IGW` attached; `ScopeGuard-Public-RT`: `0.0.0.0/0 → IGW`, assoc both subnets.
- Gateway Endpoints (free): S3 + DynamoDB attached to public RT.
- No NAT Gateway, no private subnets, no VPC peering.

## 4. Security

- `ScopeGuard-ALB-SG`: in `80,443 0.0.0.0/0`, out all.
- `ScopeGuard-App-SG`: in `3000` from `ALB-SG` only (`sgr-05ef05101bfbf047a`), no `22` (SSM only), out all.
- S3: `BlockPublicAccess=true`, `SSE AES256`, versioning Suspended, lifecycle `contracts/* Expire 1d + abort-multipart 1d`.
- DDB: SSE owned, `TTL ENABLED on ExpiresAt`.
- IAM: trust `ec2.amazonaws.com` only; inline scoped to bucket prefix, table, Kimi/Claude model ARNs; managed `SSMManagedInstanceCore` + `CloudWatchAgentServerPolicy`. LT uses IMDSv2 required.
- No static creds: prod uses instance profile; local uses `aws login`.
- Explicitly OFF: WAF, ALB/WAF rate rules, API throttling, CloudFront, Shield.

## 5. Data flow (stateless)

```
POST /api/analyze (contractFile PDF/DOCX?, contractText?, clientRequest, tone, userId)
 -> extract (unpdf / mammoth) -> S3 PutObject contracts/<ts>-<file>
 -> Bedrock Converse (system + SOW + REQUEST) -> JSON
 -> normalizeResult -> DDB PutItem (LogId, Timestamp, UserId, Tone, IsScopeCreep, RiskLevel, ClientRequest[500], EstimatedHours, ContractKey, ExpiresAt=now+24h)
 -> JSON {isScopeCreep, riskLevel, violatedClause, analysis, estimatedExtraHours, suggestedEmailResponse}
```

## 6. Cost (ap-south-1 list, Oct 2026)

- 10 days base (desired 2 = 1 OD micro + 1 Spot micro): **~$13** (ALB ~$7 + OD ~$2.78 + Spot ~$0.84 + EBS 2x30GB ~$1.90 + S3/DDB <$0.50).
- Spot fallback to `t3.small`: ~$13.90. Full scale 4: ~$16.60.
- Monthly run-rate idle: ~$39. Bedrock tokens extra (dominant under load).

---

## 7. AWS CLI Creation Playbook (idempotent)

> Prereq: `aws --version >= 2.32`, `aws login`. `export AWS_REGION=ap-south-1 BEDROCK_REGION=us-east-1 BUCKET=scopeguard-contracts-assets TABLE=ScopeLogs`.

```bash
# 0. identity
aws sts get-caller-identity

# 1. VPC + IGW + subnets + routes + endpoints
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.20.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=ScopeGuard-VPC}]' --query 'Vpc.VpcId' --output text --region $AWS_REGION) # reuse by tag if exists
IGW_ID=$(aws ec2 create-internet-gateway --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=ScopeGuard-IGW}]' --query 'InternetGateway.InternetGatewayId' --output text --region $AWS_REGION)
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID --region $AWS_REGION 2>&1 || true
PUB_A=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.20.1.0/24 --availability-zone ap-south-1a --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=ScopeGuard-Public-1a}]' --query 'Subnet.SubnetId' --output text --region $AWS_REGION)
PUB_B=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.20.2.0/24 --availability-zone ap-south-1b --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=ScopeGuard-Public-1b}]' --query 'Subnet.SubnetId' --output text --region $AWS_REGION)
RT_ID=$(aws ec2 create-route-table --vpc-id $VPC_ID --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=ScopeGuard-Public-RT}]' --query 'RouteTable.RouteTableId' --output text --region $AWS_REGION)
aws ec2 create-route --route-table-id $RT_ID --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID --region $AWS_REGION 2>&1 || true
aws ec2 associate-route-table --subnet-id $PUB_A --route-table-id $RT_ID --region $AWS_REGION 2>&1 || true
aws ec2 associate-route-table --subnet-id $PUB_B --route-table-id $RT_ID --region $AWS_REGION 2>&1 || true
aws ec2 create-vpc-endpoint --vpc-id $VPC_ID --service-name com.amazonaws.ap-south-1.s3 --route-table-ids $RT_ID --region $AWS_REGION 2>&1 || true
aws ec2 create-vpc-endpoint --vpc-id $VPC_ID --service-name com.amazonaws.ap-south-1.dynamodb --route-table-ids $RT_ID --region $AWS_REGION 2>&1 || true

# 2. S3 + DDB
aws s3api create-bucket --bucket $BUCKET --region $AWS_REGION --create-bucket-configuration LocationConstraint=$AWS_REGION 2>&1 || true
aws s3api put-public-access-block --bucket $BUCKET --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true --region $AWS_REGION
aws s3api put-bucket-encryption --bucket $BUCKET --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' --region $AWS_REGION
aws s3api put-bucket-lifecycle-configuration --bucket $BUCKET --lifecycle-configuration '{"Rules":[{"ID":"contracts-1d-expire","Status":"Enabled","Filter":{"Prefix":"contracts/"},"Expiration":{"Days":1},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}' --region $AWS_REGION
aws dynamodb create-table --table-name $TABLE --attribute-definitions AttributeName=LogId,AttributeType=S --key-schema AttributeName=LogId,KeyType=HASH --billing-mode PAY_PER_REQUEST --region $AWS_REGION 2>&1 || true
aws dynamodb wait table-exists --table-name $TABLE --region $AWS_REGION
aws dynamodb update-time-to-live --table-name $TABLE --time-to-live-specification Enabled=true,AttributeName=ExpiresAt --region $AWS_REGION 2>&1 || true

# 3. IAM (see /tmp/scopeguard-policy.json for Kimi + S3 prefix + DDB table ARNs)
aws iam create-role --role-name ScopeGuard-EC2-Role --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' 2>&1 || true
aws iam put-role-policy --role-name ScopeGuard-EC2-Role --policy-name ScopeGuard-App-Policy --policy-document file:///tmp/scopeguard-policy.json
aws iam attach-role-policy --role-name ScopeGuard-EC2-Role --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore 2>&1 || true
aws iam create-instance-profile --instance-profile-name ScopeGuard-EC2-Profile 2>&1 || true
aws iam add-role-to-instance-profile --instance-profile-name ScopeGuard-EC2-Profile --role-name ScopeGuard-EC2-Role 2>&1 || true

# 4. SGs + TG + ALB + listener + ACM
ALB_SG=$(aws ec2 create-security-group --group-name ScopeGuard-ALB-SG --description "ScopeGuard ALB" --vpc-id $VPC_ID --query 'GroupId' --output text --region $AWS_REGION)
APP_SG=$(aws ec2 create-security-group --group-name ScopeGuard-App-SG --description "ScopeGuard App EC2" --vpc-id $VPC_ID --query 'GroupId' --output text --region $AWS_REGION)
aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $AWS_REGION 2>&1 || true
aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 443 --cidr 0.0.0.0/0 --region $AWS_REGION 2>&1 || true
aws ec2 authorize-security-group-ingress --group-id $APP_SG --protocol tcp --port 3000 --source-group $ALB_SG --region $AWS_REGION 2>&1 || true
TG_ARN=$(aws elbv2 create-target-group --name scopeguard-tg --protocol HTTP --port 3000 --vpc-id $VPC_ID --health-check-path / --target-type instance --query 'TargetGroups[0].TargetGroupArn' --output text --region $AWS_REGION)
ALB_ARN=$(aws elbv2 create-load-balancer --name scopeguard-alb --scheme internet-facing --type application --subnets $PUB_A $PUB_B --security-groups $ALB_SG --query 'LoadBalancers[0].LoadBalancerArn' --output text --region $AWS_REGION)
aws elbv2 create-listener --load-balancer-arn $ALB_ARN --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=$TG_ARN --region $AWS_REGION
aws acm request-certificate --domain-name scopeguard.adityanair.tech --validation-method DNS --region $AWS_REGION # PENDING — add CNAME at registrar later

# 5. LT (MetadataOptions HttpTokens=required, 30GB gp3, UserData=base64(USER_DATA.sh)) + ASG mixed + CPU70%
AMI_ID=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --query 'Parameter.Value' --output text --region $AWS_REGION)
aws ec2 create-launch-template --launch-template-name scopeguard-lt --launch-template-data file:///tmp/sg-lt.json --region $AWS_REGION # see live state for exact JSON
aws autoscaling create-auto-scaling-group --auto-scaling-group-name scopeguard-asg --vpc-zone-identifier "$PUB_A,$PUB_B" --min-size 1 --max-size 4 --desired-capacity 2 --health-check-type ELB --health-check-grace-period 300 --target-group-arns $TG_ARN --mixed-instances-policy file:///tmp/sg-mip.json --region $AWS_REGION
aws autoscaling put-scaling-policy --auto-scaling-group-name scopeguard-asg --policy-name scopeguard-cpu70 --policy-type TargetTrackingScaling --target-tracking-configuration '{"PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"},"TargetValue":70.0}' --region $AWS_REGION
```

`/tmp/sg-mip.json` (locked): `OnDemandBaseCapacity=1, OnDemandPercentageAboveBaseCapacity=0, SpotAllocationStrategy=capacity-optimized, Overrides=[t3.micro, t3.small]`.

---

## 8. Created Infrastructure (live state)

> Last deploy: `2026-10-01 ~13:15 IST (07:45 UTC) — Account 121490076448 (root). Full v2 stack DEPLOYED. 2/2 instances InService.`

| Resource | Name / ID | Region | Status | Verified |
|---|---|---|---|---|
| VPC | `ScopeGuard-VPC` / `vpc-0e329c049c82c9e92` (`10.20.0.0/16`) | `ap-south-1` | ✅ available, DNS on | `describe-vpcs` |
| Subnet | `ScopeGuard-Public-1a` / `subnet-06fcf89369c1ec0a6` (`10.20.1.0/24`, 1a, public IP) | `ap-south-1` | ✅ | `describe-subnets` |
| Subnet | `ScopeGuard-Public-1b` / `subnet-0a2a55bcf56815cbd` (`10.20.2.0/24`, 1b, public IP) | `ap-south-1` | ✅ | `describe-subnets` |
| IGW | `ScopeGuard-IGW` / `igw-07cff09ee4dae8544` attached | `ap-south-1` | ✅ | `describe-internet-gateways` |
| Route table | `ScopeGuard-Public-RT` / `rtb-04c509c85664b1e53` (`0.0.0.0/0→IGW`) | `ap-south-1` | ✅ assoc both subnets | `describe-route-tables` |
| VPC endpoint | `ScopeGuard-S3-Endpoint` / `vpce-011cd2f401020f7eb` (`com.amazonaws.ap-south-1.s3`) | `ap-south-1` | ✅ available | `describe-vpc-endpoints` |
| VPC endpoint | `ScopeGuard-DDB-Endpoint` / `vpce-01021920e6c88a01d` (`com.amazonaws.ap-south-1.dynamodb`) | `ap-south-1` | ✅ available | `describe-vpc-endpoints` |
| S3 bucket | `scopeguard-contracts-assets` / `arn:aws:s3:::scopeguard-contracts-assets` | `ap-south-1` | ✅ `head-bucket OK`, PAB all-true, SSE AES256, lifecycle `contracts-1d-expire Enabled` | `head-bucket + get-lifecycle` |
| DynamoDB table | `ScopeLogs` / `arn:aws:dynamodb:ap-south-1:121490076448:table/ScopeLogs` | `ap-south-1` | ✅ ACTIVE, On-Demand, TTL `ENABLED on ExpiresAt` | `describe-table + describe-time-to-live` |
| IAM Role | `ScopeGuard-EC2-Role` / `arn:aws:iam::121490076448:role/ScopeGuard-EC2-Role` (`AROARYSK7OMQDLBHIGKS4`) | global | ✅ + inline `ScopeGuard-App-Policy` (Kimi/S3/DDB) + `SSMManagedInstanceCore` + `CloudWatchAgentServerPolicy` | `get-role` |
| Instance Profile | `ScopeGuard-EC2-Profile` / `arn:aws:iam::121490076448:instance-profile/ScopeGuard-EC2-Profile` | global | ✅ role attached | `get-instance-profile` |
| Security Group | `ScopeGuard-ALB-SG` / `sg-044d7a32621196778` (in `80,443 0.0.0.0/0`) | `ap-south-1` | ✅ | `describe-security-groups` |
| Security Group | `ScopeGuard-App-SG` / `sg-043fbeab0ebc5ce21` (in `3000` from `ALB-SG` only) | `ap-south-1` | ✅ | `describe-security-groups` |
| ALB | `scopeguard-alb` / `arn:aws:elasticloadbalancing:ap-south-1:121490076448:loadbalancer/app/scopeguard-alb/21c013e93778bc2e` | `ap-south-1` | ✅ active, internet-facing | `describe-load-balancers` |
| ALB DNS | `scopeguard-alb-1403866850.ap-south-1.elb.amazonaws.com` | `ap-south-1` | ✅ `:80 redirect → :443`, `:443 forward → scopeguard-tg` (TLS13-1-2) | `http://scopeguard.adityanair.tech/ → 301`, `https:// → 200` |
| Target Group | `scopeguard-tg` / `arn:aws:elasticloadbalancing:ap-south-1:121490076448:targetgroup/scopeguard-tg/9dc84fd0942521bf` | `ap-south-1` | ✅ `HTTP:3000`, health `GET /`, dereg 30s, stickiness off | `describe-target-groups` |
| ACM cert | `scopeguard.adityanair.tech` / `arn:aws:acm:ap-south-1:121490076448:certificate/f55a0e52-b43b-4050-a204-fba2f5632769` | `ap-south-1` | ✅ `ISSUED`, attached to `:443` | `describe-certificate` |
| ACM validation | `CNAME _1547d477495eb6379d2b76e2a6a60cf5.scopeguard.adityanair.tech → _1304aa7c07b3fd62321aecb20477ffc0.wzccmgtwzk.acm-validations.aws` | — | ⏳ add at .tech registrar when ready | `describe-certificate` |
| Launch Template | `scopeguard-lt` / `lt-067fa57de0fcfb4d4` v1, `AMI ami-08e3b3155fc937a94` (AL2023 x86_64), 30GB gp3, IMDSv2 required, `SG-App`, public IP, `UserData=USER_DATA.sh` (+`BEDROCK_MODEL_ID`) | `ap-south-1` | ✅ | `describe-launch-templates` |
| ASG | `scopeguard-asg` / `min 1 / desired 2 / max 4`, ELB health, 300s grace, mixed `OD-base 1 + Spot capacity-optimized [t3.micro, t3.small]` | `ap-south-1` | ✅ | `describe-auto-scaling-groups` |
| Scaling policy | `scopeguard-cpu70` / `arn:aws:autoscaling:ap-south-1:121490076448:scalingPolicy:88ef9a4e-1da6-428a-9155-eb1cf87b0dbd:...` target `70.0` | `ap-south-1` | ✅ | `describe-policies` |
| EC2 | `i-0ab8b55f256669bc9` `t3.micro` 1b On-Demand `15.207.115.83` | `ap-south-1` | ✅ running, InService | `describe-instances` |
| EC2 | `i-03b6aab03b6e7038c` `t3.micro` 1a Spot `13.233.127.147` | `ap-south-1` | ✅ running, InService | `describe-instances` |
| CloudWatch | Log group `/ScopeGuard/app` | `ap-south-1` | ✅ created (app logging wires on next USER_DATA rev) | `describe-log-groups` |
| Bedrock model | `moonshotai.kimi-k2.5` (`BEDROCK_MODEL_ID`), IAM allows Kimi + Sonnet-4-5/Haiku-4-5 + inference-profiles | `us-east-1` | ✅ E2E verified earlier | `bedrock-runtime converse` |
| Excluded | NAT Gateway, WAF, rate-limiting, CloudFront, Route53 zone, private subnets | — | ⛔ per lock | — |

### Run log

- `2026-10-01 ~07:31 UTC`: user `remove deployed infra` → emptied S3 (4 objs) + deleted bucket, `delete-table ScopeLogs`, removed `ScopeGuard-EC2-Role/Profile`, deleted `ScopeGuard-SG`. Verified all gone.
- `2026-10-01`: plan locked — dedicated VPC, no WAF/rate-limit, ASG `1/2/4 CPU70%`, domain `scopeguard.adityanair.tech` deferred, no NAT, Spot `1 OD + overflow`, overrides `[t3.micro, t3.small]`, stateless confirmed.
- `2026-10-01 07:43 UTC`: `create-vpc vpc-0e329c049c82c9e92` + IGW + 2 public subnets + RT + S3/DDB gateway endpoints OK.
- `2026-10-01 07:43 UTC`: `create-bucket scopeguard-contracts-assets` + PAB + SSE + lifecycle `contracts-1d-expire` OK; `create-table ScopeLogs` → ACTIVE + TTL `ExpiresAt` OK.
- `2026-10-01 07:44 UTC`: `create-role ScopeGuard-EC2-Role (AROARYSK7OMQDLBHIGKS4)` + inline Kimi/S3/DDB + `SSM + CloudWatchAgent` + profile OK.
- `2026-10-01 ~07:45 UTC`: `ALB-SG sg-044d7a32621196778` (80/443) + `App-SG sg-043fbeab0ebc5ce21` (3000 from ALB-SG) + `TG 9dc84fd0942521bf` + `ALB 21c013e93778bc2e` (`scopeguard-alb-1403866850...`) + `:80 forward` + ACM `f55a0e52... PENDING` OK.
- `2026-10-01 07:47 UTC`: `USER_DATA.sh += BEDROCK_MODEL_ID`; `LT lt-067fa57de0fcfb4d4 v1 (ami-08e3b3155fc937a94)` OK.
- `2026-10-01 07:48 UTC`: `ASG scopeguard-asg 1/2/4` mixed (`$Default`, micro+small, OD-base 1, capacity-optimized) + `scopeguard-cpu70=70.0` + log group `/ScopeGuard/app` OK. Instances `i-0ab8b55f (OD)` + `i-03b6aab0 (Spot)` InService; TG warmed `initial → healthy`, ALB `502 → 200`.
- `2026-10-01 ~08:05 UTC`: DOMAIN CUTOVER DONE — user added registrar CNAMEs, ACM `PENDING → ISSUED`. Added `:443 HTTPS forward (TLS13-1-2, cert f55a0e52)` + `:80 → :443 301 redirect`. Verified `http://scopeguard.adityanair.tech/ → 301`, `https:// → 200`, `/dashboard → 200`, `POST /api/analyze → HIGH valid JSON`.

### Domain cutover (YOU — deferred until you approve)

```text
1. At .tech registrar add:
   CNAME scopeguard -> scopeguard-alb-1403866850.ap-south-1.elb.amazonaws.com
   CNAME _1547d477495eb6379d2b76e2a6a60cf5.scopeguard.adityanair.tech -> _1304aa7c07b3fd62321aecb20477ffc0.wzccmgtwzk.acm-validations.aws.
2. Wait ACM -> ISSUED, then tell me: I add :443 listener + 80->443 redirect.
```

### Verify

```bash
export AWS_REGION=ap-south-1 BUCKET=scopeguard-contracts-assets TABLE=ScopeLogs
aws s3api head-bucket --bucket $BUCKET --region $AWS_REGION
aws dynamodb describe-table --table-name $TABLE --region $AWS_REGION --query 'Table.[TableName,TableStatus]'
aws elbv2 describe-load-balancers --names scopeguard-alb --query 'LoadBalancers[0].[DNSName,State.Code]' --region $AWS_REGION
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names scopeguard-asg --query 'AutoScalingGroups[0].[MinSize,MaxSize,DesiredCapacity]' --output text --region $AWS_REGION
curl -s -o /dev/null -w "%{http_code}\n" http://scopeguard-alb-1403866850.ap-south-1.elb.amazonaws.com/
```

### Drift / action items

- TG targets `initial` at deploy — re-check `describe-target-health` in ~5 min for `healthy` (USER_DATA npm build takes minutes).
- ACM `PENDING_VALIDATION` by design — no `:443` until you add registrar CNAMEs.
- Running as `root` — create least-privilege IAM user for day-to-day; keep root for billing.
- `README` still mentions `pdf-parse` vs code `unpdf`/`mammoth` — doc-only drift.
