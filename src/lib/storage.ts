import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { downloadLifetime } from './membership/status.mjs';
import { DomainError } from './membership/core.mjs';

function storage() {
  if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) throw new Error('对象存储未配置');
  return new S3Client({ endpoint: process.env.S3_ENDPOINT || undefined, region: process.env.S3_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
}
export type ExportFile = { key: string; name: string; type: string };
export async function uploadFile(key: string, name: string, type: string, body: Buffer): Promise<ExportFile> {
  await storage().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: type }));
  return { key, name, type };
}
export async function signedFiles(files: ExportFile[], membershipExpiresAt: Date) {
  const expiresIn = downloadLifetime(membershipExpiresAt);
  if (expiresIn < 1) throw new DomainError(403, '会员已到期，请续期后下载');
  const client = storage();
  return Promise.all(files.map(async file => ({ name: file.name, url: await getSignedUrl(client, new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: file.key, ResponseContentDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`, ResponseContentType: file.type }), { expiresIn }) })));
}
