import { db } from '@/lib/db';
import { endpoint, json, requireUser } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  return endpoint(async () => {
    const user = await requireUser();
    const [wallet, redemptions, ledger, exports] = await Promise.all([
      db.wallet.findUnique({ where: { userId: user.id } }),
      db.redemption.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50, include: { card: { select: { suffix: true } } } }),
      db.ledger.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      db.exportJob.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, status: true, createdAt: true } }),
    ]);
    return json({ user: { id: user.id, email: user.email, role: user.role }, balance: wallet?.balance ?? 0, reserved: wallet?.reserved ?? 0, redemptions, ledger, exports });
  });
}
