import { prisma } from '../../../../lib/prisma';

export async function GET() {
  try {
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
      message: 'Tabela PasswordResetToken utworzona.'
    });
  } catch (err) {
    return Response.json({
      ok: false,
      error: String(err.message || err)
    }, { status: 500 });
  }
}
