#!/bin/bash
set -euo pipefail

yum update -y
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
yum install -y nodejs git
npm install -g pm2

cd /home/ec2-user
git clone https://github.com/ADITYANAIR01/ScopeGuard-AI-AWS-Zero-to-Shipped.git
cd ScopeGuard-AI-AWS-Zero-to-Shipped

cat > .env.local <<'ENV'
AWS_REGION=ap-south-1
AWS_BEDROCK_REGION=us-east-1
S3_BUCKET_NAME=scopeguard-contracts-assets
DYNAMODB_TABLE_NAME=ScopeLogs
ENV

npm install
npm run build
pm2 start npm --name scopeguard -- start
pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save
