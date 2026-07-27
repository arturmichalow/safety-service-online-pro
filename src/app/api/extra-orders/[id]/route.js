import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

function data(body) {
  return {
    companyId: body.companyId,
    date: body.date ? new Date(body.date) : undefined,
    title: body.title,
    type: body.type || 'inne',
    description: body.description || null,
    netAmount: Number(body.netAmount || 0),
    travelCost: Number(body.travelCost || 0),
    extraCost: Number(body.extraCost || 0),
    extraCostDescription: body.extraCostDescription || null,
    orderNumber: body.orderNumber || null,
    billingMode: body.billingMode === 'ONE_TIME' ? 'ONE_TIME' : 'MONTHLY',
    status: body.status || 'OPEN',
    ...(body.minutes !== undefined ? { minutes: Number(body.minutes || 0) } : {})
  };
}

export async function PUT(req, { params }) {
  try {
    const user = await currentUser();

    if (!user || user.role !== 'ADMIN') {
      return Response.json({ error: 'Brak uprawnień.' }, { status: 403 });
    }

    const body = await req.json();
    const before = await prisma.extraOrder.findUnique({ where: { id: params.id } });

    if (!before) {
      return Response.json({ error: 'Nie znaleziono zlecenia.' }, { status: 404 });
    }

    const order = await prisma.extraOrder.update({
      where: { id: params.id },
      data: data(body),
      include: { company: true }
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entity: 'ExtraOrder',
        entityId: order.id,
        before,
        after: order
      }
    });

    return Response.json(order);
  } catch (error) {
    console.error('UPDATE EXTRA ORDER ERROR:', error);
    return Response.json(
      { error: error?.message || 'Nie udało się zapisać zmian.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req, { params }) {
  try {
    const user = await currentUser();

    if (!user || user.role !== 'ADMIN') {
      return Response.json({ error: 'Brak uprawnień.' }, { status: 403 });
    }

    const before = await prisma.extraOrder.findUnique({ where: { id: params.id } });

    if (!before) {
      return Response.json({ error: 'Nie znaleziono zlecenia.' }, { status: 404 });
    }

    await prisma.extraOrder.delete({ where: { id: params.id } });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE',
        entity: 'ExtraOrder',
        entityId: params.id,
        before
      }
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('DELETE EXTRA ORDER ERROR:', error);
    return Response.json(
      { error: error?.message || 'Nie udało się usunąć zlecenia.' },
      { status: 500 }
    );
  }
}
