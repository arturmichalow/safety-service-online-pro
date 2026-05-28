import { prisma } from '../../../lib/prisma';
import { currentUser } from '../../../lib/auth';

function data(b) {
  return {
    companyId: b.companyId,
    date: b.date ? new Date(b.date) : new Date(),
    title: b.title,
    type: b.type || 'inne',
    description: b.description || null,
    netAmount: Number(b.netAmount || 0),
    travelCost: Number(b.travelCost || 0),
    extraCost: Number(b.extraCost || 0),
    minutes: Number(b.minutes || 0),
    extraCostDescription: b.extraCostDescription || null,
    orderNumber: b.orderNumber || null,
    status: b.status || 'OPEN'
  };
}

export async function POST(req) {
  const user = await currentUser();

  if (!user || !['ADMIN', 'WORKER'].includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();

  if (!body.companyId || !body.title) {
    return Response.json(
      { error: 'Wybierz firmę i wpisz nazwę zlecenia.' },
      { status: 400 }
    );
  }

  const order = await prisma.extraOrder.create({
    data: data(body),
    include: { company: true }
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'CREATE',
      entity: 'ExtraOrder',
      entityId: order.id,
      after: order
    }
  });

  return Response.json(order);
}
