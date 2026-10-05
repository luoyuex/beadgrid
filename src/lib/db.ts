import { PrismaClient } from '@prisma/client';
const globalDb = globalThis as unknown as { perlerDb?: PrismaClient };
export const db = globalDb.perlerDb ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalDb.perlerDb = db;
