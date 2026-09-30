import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

export const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_BEDROCK_REGION || "us-east-1",
  maxAttempts: 5,
  retryMode: "adaptive",
});

export const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  maxAttempts: 5,
  retryMode: "adaptive",
});

export const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-south-1",
  maxAttempts: 5,
  retryMode: "adaptive",
});
