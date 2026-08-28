import { prisma } from '../../../lib/prisma';
import { currentUser } from '../../../lib/auth';

export async function POST(req) {
  try {
    const user = await currentUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const b = await req.json();
    if (!b.companyId) {
      return Response.json({ error: 'Nie wybrano firmy.' }, { status: 400 });
    }

    const entry = await prisma.workEntry.create({
      data: {
        date: new Date(b.date),
        companyId: b.companyId,
        userId: user.id,
        orderNumber: b.orderNumber || null,
        type: b.type || 'inne',
        title: b.title,
        description: b.description || null,
        minutes: Number(b.minutes || 0),
        travelMinutes: Number(b.travelMinutes || 0),
        additionalCost: Number(b.additionalCost || 0),
        additionalCostDescription: b.additionalCostDescription || null
      }
    });

    // Awaria logu audytowego nie może cofnąć prawidłowo dodanego wpisu.
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'CREATE',
          entity: 'WorkEntry',
          entityId: entry.id,
          after: {
            id: entry.id,
            date: entry.date.toISOString(),
            companyId: entry.companyId,
            userId: entry.userId,
            orderNumber: entry.orderNumber,
            type: entry.type,
            title: entry.title,
            description: entry.description,
            minutes: entry.minutes,
            travelMinutes: entry.travelMinutes,
            additionalCost: Number(entry.additionalCost || 0),
            additionalCostDescription: entry.additionalCostDescription
          }
        }
      });
    } catch (auditError) {
      console.error('WorkEntry audit log failed:', auditError);
    }

    return Response.json(entry);
  } catch (error) {
    console.error('POST /api/work failed:', error);
    return Response.json({ error: 'Nie udało się dodać wpisu.' }, { status: 500 });
  }
}
