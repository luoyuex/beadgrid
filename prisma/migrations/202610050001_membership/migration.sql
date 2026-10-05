CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "email" TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false, "image" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'USER' CHECK ("role" IN ('USER','ADMIN')), "banned" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY, "expiresAt" TIMESTAMP(3) NOT NULL, "token" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT, "userAgent" TEXT, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE TABLE "Account" (
  "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accessToken" TEXT, "refreshToken" TEXT, "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3), "refreshTokenExpiresAt" TIMESTAMP(3), "scope" TEXT, "password" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE("providerId", "accountId")
);
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE TABLE "Verification" (
  "id" TEXT PRIMARY KEY, "identifier" TEXT NOT NULL, "value" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");
CREATE TABLE "Wallet" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "balance" INTEGER NOT NULL DEFAULT 0, "reserved" INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_nonnegative" CHECK ("balance" >= 0 AND "reserved" >= 0 AND "reserved" <= "balance")
);
CREATE TABLE "CardBatch" (
  "id" TEXT PRIMARY KEY, "credits" INTEGER NOT NULL CHECK ("credits" > 0), "count" INTEGER NOT NULL CHECK ("count" > 0),
  "expiresAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Card" (
  "id" TEXT PRIMARY KEY, "digest" TEXT NOT NULL UNIQUE, "suffix" TEXT NOT NULL,
  "batchId" TEXT NOT NULL REFERENCES "CardBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'UNUSED' CHECK ("status" IN ('UNUSED','REDEEMED','DISABLED')), "redeemedAt" TIMESTAMP(3)
);
CREATE INDEX "Card_batchId_status_idx" ON "Card"("batchId", "status");
CREATE TABLE "Redemption" (
  "id" TEXT PRIMARY KEY, "cardId" TEXT NOT NULL UNIQUE REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "credits" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Redemption_userId_createdAt_idx" ON "Redemption"("userId", "createdAt");
CREATE TABLE "Ledger" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "delta" INTEGER NOT NULL, "reason" TEXT NOT NULL, "reference" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Ledger_userId_createdAt_idx" ON "Ledger"("userId", "createdAt");
CREATE TABLE "ExportJob" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING' CHECK ("status" IN ('PROCESSING','SUCCEEDED','FAILED')),
  "attempt" TEXT NOT NULL, "leaseUntil" TIMESTAMP(3) NOT NULL, "files" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE("userId", "hash")
);
CREATE INDEX "ExportJob_status_leaseUntil_idx" ON "ExportJob"("status", "leaseUntil");
CREATE TABLE "Audit" (
  "id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "action" TEXT NOT NULL, "targetId" TEXT NOT NULL,
  "detail" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "RateLimit" (
  "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "count" INTEGER NOT NULL, "lastRequest" DOUBLE PRECISION NOT NULL
);
CREATE TABLE "RequestLimit" (
  "key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 0, "resetAt" TIMESTAMP(3) NOT NULL
);
