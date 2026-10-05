import { db } from '@/lib/db';
import { assertOrigin, endpoint, json, rateLimit, readJson, requireUser } from '@/lib/http';
import { exportHash, validateExport, startExport, finishExport, releaseExport, requireMembership } from '@/lib/membership/core.mjs';
import { renderFiles } from '@/lib/membership/render.mjs';
import type { ExportPayload } from '@/types/exportTypes';
import { uploadFile, downloadFiles, type ExportFile } from '@/lib/storage';
import mapping from '@/app/colorSystemMapping.json';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    const user = await requireUser();
    await rateLimit(`export:${user.id}`, 10);
    const payload = validateExport(await readJson(request, 4_000_000), mapping) as ExportPayload;
    const result = await startExport(db, user.id, exportHash(payload));
    if (result.cached) {
      await requireMembership(db, user.id);
      return json({ id: result.job.id, cached: true, files: downloadFiles(result.job.files as ExportFile[], result.job.id) });
    }
    try {
      const files: ExportFile[] = [];
      for (const file of renderFiles(payload)) files.push(await uploadFile(`exports/${user.id}/${result.job.id}/${result.job.attempt}/${file.name}`, file.name, file.type, file.body));
      // Complete only after storage succeeds and membership is rechecked.
      await requireMembership(db, user.id);
      const downloads = downloadFiles(files, result.job.id);
      await finishExport(db, result.job, files);
      return json({ id: result.job.id, cached: false, files: downloads });
    } catch (error) {
      await releaseExport(db, result.job);
      throw error;
    }
  });
}
