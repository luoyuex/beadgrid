import { db } from '@/lib/db';
import { endpoint, requireUser } from '@/lib/http';
import { downloadResponse } from '@/lib/membership/download.mjs';
import { readFile } from '@/lib/storage';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  return endpoint(async () => {
    const user = await requireUser();
    const { id, index } = await context.params;
    return downloadResponse(db, user.id, id, index, readFile);
  });
}
