import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// S3-compatible object storage. Locally this is MinIO (docker-compose) or any S3 emulator;
// point S3_ENDPOINT at a real bucket to switch providers.
const bucket = process.env.S3_BUCKET ?? "field-service";
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
  },
});

let bucketReady: Promise<void> | null = null;

function ensureBucket() {
  bucketReady ??= client
    .send(new HeadBucketCommand({ Bucket: bucket }))
    .then(() => undefined)
    .catch(async () => {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    })
    .catch((error: unknown) => {
      bucketReady = null;
      throw error;
    });
  return bucketReady;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await ensureBucket();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function downloadUrl(key: string, fileName: string) {
  await ensureBucket();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `inline; filename="${fileName.replace(/"/g, "")}"`,
    }),
    { expiresIn: 300 },
  );
}

export async function getObjectBytes(key: string) {
  await ensureBucket();
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await result.Body!.transformToByteArray());
}
