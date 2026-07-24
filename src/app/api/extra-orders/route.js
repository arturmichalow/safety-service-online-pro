import { prisma } from '../../../lib/prisma';
import { currentUser } from '../../../lib/auth';

function orderData(body) {
  return {
    companyId: body.companyId,
    date: body.date ? new Date(body.date) : new Date(),
    title: String(body.title || '').trim(),
    type: String(body.type || 'inne').trim(),
    description: body.description ? String(body.description).trim() : null,
    netAmount: Number(body.netAmount || 0),
    travelCost: Number(body.travelCost || 0),
    extraCost: Number(body.extraCost || 0),
    minutes: Number(body.minutes || 0),
    extraCostDescription: body.extraCostDescription ? String(body.extraCostDescription).trim() : null,
    orderNumber: body.orderNumber ? String(body.orderNumber).trim() : null,
    status: body.status || 'OPEN'
  };
}

export async function POST(req) {
  const user = await currentUser();

  if (!user || !['ADMIN', 'WORKER'].includes(user.role)) {
    return Response.json({ error: 'Brak uprawnień.' }, { status: 403 });
  }

  const body = await req.json();
  const data = orderData(body);

  if (!data.companyId) {
    return Response.json({ error: 'Wybierz firmę.' }, { status: 400 });
  }

  if (!data.title) {
    return Response.json({ error: 'Wpisz opis wykonywanych prac.' }, { status: 400 });
  }

  if (data.minutes <= 0) {
    return Response.json({ error: 'Czas pracy musi być większy od zera.' }, { status: 400 });
  }

  if (data.netAmount <= 0) {
    return Response.json({ error: 'Kwota netto za zlecenie musi być większa od zera.' }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { id: data.companyId } });
  if (!company) {
    return Response.json({ error: 'Wybrana firma nie istnieje.' }, { status: 404 });
  }

  const order = await prisma.extraOrder.create({
    data,
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

  return Response.json(order, { status: 201 });
}
