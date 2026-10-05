export const DAY_MS = 24 * 60 * 60 * 1000;
export function downloadLifetime(expiresAt, now = new Date()) {
  const remaining = new Date(expiresAt).getTime() - now.getTime();
  return Number.isFinite(remaining) ? Math.max(0, Math.min(300, Math.floor(remaining / 1000))) : 0;
}
export function membershipStatus(expiresAt, now = new Date()) {
  const expiry = expiresAt ? new Date(expiresAt) : null;
  const valid = expiry && Number.isFinite(expiry.getTime());
  const remaining = valid ? expiry.getTime() - now.getTime() : 0;
  return {
    expiresAt: valid ? expiry.toISOString() : null,
    active: remaining > 0,
    remainingDays: remaining > 0 ? Math.ceil(remaining / DAY_MS) : 0,
  };
}
