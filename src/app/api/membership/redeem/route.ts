import { db } from '@/lib/db';
import { assertOrigin, endpoint, HttpError, json, rateLimit, readJson, requireUser } from '@/lib/http';
import { digestCard, redeem } from '@/lib/membership/core.mjs';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    const user = await requireUser();
    await rateLimit(`redeem:${user.id}`, 5);
    const body = await readJson(request);
    if (!body || typeof body !== 'object') throw new HttpError(400, '请求无效');
    return json(await redeem(db, user.id, digestCard(body.code, process.env.CARD_HASH_SECRET)));
  });
}
