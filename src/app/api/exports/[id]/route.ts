import { db } from '@/lib/db';
import { endpoint, HttpError, json, requireUser } from '@/lib/http';
import { downloadFiles, type ExportFile } from '@/lib/storage';
import { requireMembership } from '@/lib/membership/core.mjs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const user = await requireUser();
    await requireMembership(db, user.id);
    const { id } = await context.params;
    const job = await db.exportJob.findFirst({ where: { id, userId: user.id, status: 'SUCCEEDED' } });
    if (!job) throw new HttpError(404, '导出文件不存在或尚未完成');
    return json({ id, files: downloadFiles(job.files as ExportFile[], id) });
  });
}
