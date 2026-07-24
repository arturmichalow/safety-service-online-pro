import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

function orderData(body) {
  return {
    companyId: body.companyId,
    date: body.date ? new Date(body.date) : undefined,
    title: body.title !== undefined ? String(body.title).trim() : undefined,
    type: body.type !== undefined ? String(body.type || 'inne').trim() : undefined,
    description: body.description ? String(body.description).trim() : null,
    netAmount: body.netAmount !== undefined ? Number(body.netAmount || 0) : undefined,
    travelCost: body.travelCost !== undefined ? Number(body.travelCost || 0) : undefined,
    extraCost: body.extraCost !== undefined ? Number(body.extraCost || 0) : undefined,
    minutes: body.minutes !== undefined ? Number(body.minutes || 0) : undefined,
    extraCostDescription: body.extraCostDescription ? String(body.extraCostDescription).trim() : null,
    orderNumber: body.orderNumber ? String(body.orderNumber).trim() : null,
    status: body.status || undefined
  };
}

export async function PUT(req, { params }) {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') {
    return Response.json({ error: 'Brak uprawnień.' }, { status: 403 });
  }

  const existing = await prisma.extraOrder.findUnique({ where: { id: params.id } });
  if (!existing) {
    return Response.json({ error: 'Zlecenie nie istnieje.' }, { status: 404 });
  }

  const body = await req.json();
  const data = orderData(body);
  const order = await prisma.extraOrder.update({
    where: { id: params.id },
    data,
    include: { company: true }
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'UPDATE',
      entity: 'ExtraOrder',
      entityId: order.id,
      before: existing,
      after: order
    }
  });

  return Response.json(order);
}

export async function DELETE(req, { params }) {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') {
    return Response.json({ error: 'Brak uprawnień.' }, { status: 403 });
  }

  const existing = await prisma.extraOrder.findUnique({ where: { id: params.id } });
  if (!existing) {
    return Response.json({ error: 'Zlecenie nie istnieje.' }, { status: 404 });
  }

  await prisma.extraOrder.delete({ where: { id: params.id } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'DELETE',
      entity: 'ExtraOrder',
      entityId: params.id,
      before: existing
    }
  });

  return Response.json({ ok: true });
}
