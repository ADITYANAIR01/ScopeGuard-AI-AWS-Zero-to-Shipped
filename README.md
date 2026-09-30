# ScopeGuard AI

ScopeGuard AI cross-references client feature requests against a Statement of Work, cites the relevant clause, estimates additional hours, and drafts a professional response.

## Stack

- Next.js 14 App Router and TypeScript
- Amazon Bedrock Claude 3.5 Sonnet in `us-east-1`
- Amazon S3 and DynamoDB in `ap-south-1`
- Node.js on Amazon EC2 (no Lambda or API Gateway)

## Local setup

1. Install Node.js 20+.
2. Copy `.env.example` to `.env.local` and fill in AWS resource values.
3. Use AWS credentials from your local profile or an attached EC2 IAM role.
4. Run `npm install`, then `npm run dev`.

The IAM role needs Bedrock model invocation, S3 `PutObject`, and DynamoDB `PutItem` permissions. The S3 bucket and `ScopeLogs` table must exist before analysis requests are sent.

## Architecture

```text
CLIENT REQUEST       AWS EC2 (t3.micro)                AWS SERVICES
-------------        ------------------                ------------
User Browser  --->   Next.js App Server     --->       Amazon S3 (Contract PDFs)
                     (Port 3000)            --->       Amazon Bedrock (Claude 3.5 Sonnet)
                                            --->       Amazon DynamoDB (Logs)
```

## Production deployment

`USER_DATA.sh` contains a starting point for an Amazon Linux EC2 instance. Review the repository URL, IAM role, security group, and secret/resource values before using it. Keep port 3000 private behind a reverse proxy or load balancer in a production deployment.
