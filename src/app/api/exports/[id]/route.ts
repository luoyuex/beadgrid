import { db } from '@/lib/db';
import { endpoint, HttpError, json, requireUser } from '@/lib/http';
import { signedFiles, type ExportFile } from '@/lib/storage';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const job = await db.exportJob.findFirst({ where: { id, userId: user.id, status: 'SUCCEEDED' } });
    if (!job) throw new HttpError(404, '导出文件不存在或尚未完成');
    return json({ id, files: await signedFiles(job.files as ExportFile[]) });
  });
}
