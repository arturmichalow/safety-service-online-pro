import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

function data(b) {
  return {
    date: b.date ? new Date(b.date) : undefined,
    companyId: b.companyId,
    orderNumber: b.orderNumber || null,
    type: b.type || 'inne',
    title: b.title || b.type || 'Wpis pracy',
    description: b.description || null,
    minutes: Number(b.minutes || 0),
    travelMinutes: Number(b.travelMinutes || 0),
    additionalCost: Number(b.additionalCost || 0),
    additionalCostDescription: b.additionalCostDescription || null
  };
}

export async function PUT(req, { params }) {
  const user = await currentUser();

  if (!user || !['ADMIN', 'WORKER'].includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();

  const existing = await prisma.workEntry.findUnique({
    where: { id: params.id }
  });

  if (!existing) {
    return Response.json({ error: 'Nie znaleziono wpisu.' }, { status: 404 });
  }

  if (user.role !== 'ADMIN' && existing.userId !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const entry = await prisma.workEntry.update({
    where: { id: params.id },
    data: data(body),
    include: { company: true, user: true }
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'UPDATE',
      entity: 'WorkEntry',
      entityId: entry.id,
      after: entry
    }
  });

  return Response.json(entry);
}

export async function DELETE(req, { params }) {
  const user = await currentUser();

  if (!user || !['ADMIN', 'WORKER'].includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const existing = await prisma.workEntry.findUnique({
    where: { id: params.id }
  });

  if (!existing) {
    return Response.json({ error: 'Nie znaleziono wpisu.' }, { status: 404 });
  }

  if (user.role !== 'ADMIN' && existing.userId !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.workEntry.delete({
    where: { id: params.id }
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'DELETE',
      entity: 'WorkEntry',
      entityId: params.id,
      before: existing
    }
  });

  return Response.json({ ok: true });
}