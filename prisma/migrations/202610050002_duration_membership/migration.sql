-- User explicitly confirmed duration membership. Additive migration only:
-- original Wallet/Ledger/CardBatch/Card/Redemption tables remain intact.
-- Old export credits are never implicitly converted into membership days.
BEGIN;
CREATE TABLE "Membership" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "MembershipCardBatch" (
  "id" TEXT PRIMARY KEY, "durationDays" INTEGER NOT NULL CHECK ("durationDays" BETWEEN 1 AND 36500),
  "count" INTEGER NOT NULL CHECK ("count" BETWEEN 1 AND 500),
  "expiresAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "MembershipCard" (
  "id" TEXT PRIMARY KEY, "digest" TEXT NOT NULL UNIQUE, "suffix" TEXT NOT NULL,
  "batchId" TEXT NOT NULL REFERENCES "MembershipCardBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'UNUSED' CHECK ("status" IN ('UNUSED','REDEEMED','DISABLED')), "redeemedAt" TIMESTAMP(3)
);
CREATE INDEX "MembershipCard_batchId_status_idx" ON "MembershipCard"("batchId", "status");
CREATE TABLE "MembershipRedemption" (
  "id" TEXT PRIMARY KEY, "cardId" TEXT NOT NULL UNIQUE REFERENCES "MembershipCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "durationDays" INTEGER NOT NULL CHECK ("durationDays" BETWEEN 1 AND 36500), "previousExpiresAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MembershipRedemption_userId_createdAt_idx" ON "MembershipRedemption"("userId", "createdAt");
CREATE TABLE "MembershipEvent" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "days" INTEGER NOT NULL CHECK ("days" <> 0), "previousExpiresAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL, "reason" TEXT NOT NULL, "reference" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MembershipEvent_userId_createdAt_idx" ON "MembershipEvent"("userId", "createdAt");
COMMIT;
