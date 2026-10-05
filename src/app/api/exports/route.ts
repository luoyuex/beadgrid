import { db } from '@/lib/db';
import { assertOrigin, endpoint, json, rateLimit, readJson, requireUser } from '@/lib/http';
import { exportHash, validateExport, reserveExport, finishExport, releaseExport } from '@/lib/membership/core.mjs';
import { renderFiles } from '@/lib/membership/render.mjs';
import type { ExportPayload } from '@/types/exportTypes';
import { uploadFile, signedFiles, type ExportFile } from '@/lib/storage';
import mapping from '@/app/colorSystemMapping.json';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    const user = await requireUser();
    await rateLimit(`export:${user.id}`, 10);
    const payload = validateExport(await readJson(request, 4_000_000), mapping) as ExportPayload;
    const reserved = await reserveExport(db, user.id, exportHash(payload));
    if (reserved.cached) return json({ id: reserved.job.id, cached: true, files: await signedFiles(reserved.job.files as ExportFile[]) });
    try {
      const files: ExportFile[] = [];
      for (const file of renderFiles(payload)) files.push(await uploadFile(`exports/${user.id}/${reserved.job.id}/${reserved.job.attempt}/${file.name}`, file.name, file.type, file.body));
      // Signing happens before charging: any storage failure releases the reservation.
      const downloads = await signedFiles(files);
      await finishExport(db, reserved.job, files);
      return json({ id: reserved.job.id, cached: false, files: downloads });
    } catch (error) {
      await releaseExport(db, reserved.job);
      throw error;
    }
  });
}
