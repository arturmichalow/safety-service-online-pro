export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { currentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function POST() {
  const user = await currentUser();

  if (!user || user.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.$transaction([
      prisma.workEntry.deleteMany(),
      prisma.extraOrder.deleteMany(),
      prisma.company.deleteMany()
    ]);

    return Response.json({ ok: true, message: "Dane firm, wpisów pracy i zleceń zostały usunięte." });
  } catch (err) {
    console.error("CLEAR DATA ERROR:", err);

    return Response.json(
      { error: "Nie udało się wyczyścić danych.", details: String(err.message || err) },
      { status: 500 }
    );
  }
}