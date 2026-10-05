import { DomainError, requireMembership } from './core.mjs';

export function downloadFiles(files, jobId) {
  return files.map((file, index) => ({ name: file.name, url: `/api/exports/${encodeURIComponent(jobId)}/files/${index}` }));
}

export async function downloadResponse(db, userId, id, index, readFile) {
  await requireMembership(db, userId);
  if (!/^(0|[1-9]\d?)$/.test(index)) throw new DomainError(404, '文件不存在');
  const job = await db.exportJob.findFirst({ where: { id, userId, status: 'SUCCEEDED' } });
  const file = job?.files?.[Number(index)];
  if (!file) throw new DomainError(404, '文件不存在');
  const stream = await readFile(file);
  return new Response(stream, { headers: {
    'Content-Type': file.type,
    'Content-Disposition': `attachment; filename="download.png"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
