import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

function orderData(body) {
  return {
    ...(body.companyId !== undefined ? { companyId: body.companyId } : {}),
    ...(body.date !== undefined ? { date: new Date(body.date) } : {}),
    ...(body.title !== undefined
      ? { title: String(body.title || '').trim() }
      : {}),
    ...(body.type !== undefined
      ? { type: String(body.type || 'inne').trim() }
      : {}),
    ...(body.description !== undefined
      ? {
          description: body.description
            ? String(body.description).trim()
            : null
        }
      : {}),
    ...(body.netAmount !== undefined
      ? { netAmount: Number(body.netAmount || 0) }
      : {}),
    ...(body.travelCost !== undefined
      ? { travelCost: Number(body.travelCost || 0) }
      : {}),
    ...(body.extraCost !== undefined
      ? { extraCost: Number(body.extraCost || 0) }
      : {}),
    ...(body.minutes !== undefined
      ? { minutes: Number(body.minutes || 0) }
      : {}),
    ...(body.extraCostDescription !== undefined
      ? {
          extraCostDescription: body.extraCostDescription
            ? String(body.extraCostDescription).trim()
            : null
        }
      : {}),
    ...(body.orderNumber !== undefined
      ? {
          orderNumber: body.orderNumber
            ? String(body.orderNumber).trim()
            : null
        }
      : {}),
    ...(body.status !== undefined ? { status: body.status } : {})
  };
}

export async function PUT(req, { params }) {
  try {
    const user = await currentUser();

    if (!user || user.role !== 'ADMIN') {
      return Response.json({ error: 'Brak uprawnień.' }, { status: 403 });
    }

    const before = await prisma.extraOrder.findUnique({
      where: { id: params.id }
    });

    if (!before) {
      return Response.json(
        { error: 'Nie znaleziono zlecenia.' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const order = await prisma.extraOrder.update({
      where: { id: params.id },
      data: orderData(body),
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

    const before = await prisma.extraOrder.findUnique({
      where: { id: params.id }
    });

    if (!before) {
      return Response.json(
        { error: 'Nie znaleziono zlecenia.' },
        { status: 404 }
      );
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
