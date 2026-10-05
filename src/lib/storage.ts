import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

function storage() {
  if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) throw new Error('对象存储未配置');
  return new S3Client({ endpoint: process.env.S3_ENDPOINT || undefined, region: process.env.S3_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
}
export type ExportFile = { key: string; name: string; type: string };
export async function uploadFile(key: string, name: string, type: string, body: Buffer): Promise<ExportFile> {
  await storage().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: type }));
  return { key, name, type };
}
export { downloadFiles } from './membership/download.mjs';
export async function readFile(file: ExportFile) {
  const result = await storage().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: file.key }));
  if (!result.Body) throw new Error('对象存储返回空文件');
  return result.Body.transformToWebStream();
}
