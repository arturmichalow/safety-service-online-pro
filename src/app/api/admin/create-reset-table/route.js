import { prisma } from '../../../../../lib/prisma';
import { currentUser } from '../../../../../lib/auth';

export async function GET() {
  const user = currentUser();

  if (!user || user.role !== 'ADMIN') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
      "id" TEXT PRIMARY KEY,
      "email" TEXT NOT NULL,
      "token" TEXT NOT NULL UNIQUE,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return Response.json({
    ok: true,
    message: 'Tabela PasswordResetToken została utworzona.'
  });
}