import { db } from '@/lib/db';
import { endpoint, json, requireUser } from '@/lib/http';
import { membershipStatus } from '@/lib/membership/status.mjs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return endpoint(async () => {
    const user = await requireUser();
    const [membership, redemptions, events, exports] = await Promise.all([
      db.membership.findUnique({ where: { userId: user.id } }),
      db.redemption.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50, include: { card: { select: { suffix: true } } } }),
      db.membershipEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      db.exportJob.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, status: true, createdAt: true } }),
    ]);
    return json({ user: { id: user.id, email: user.email, role: user.role }, membership: membershipStatus(membership?.expiresAt), redemptions, events, exports });
  });
}
