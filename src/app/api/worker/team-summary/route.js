import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return null;

  const [year, monthNumber] = String(month).split('-').map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;

  return {
    from: new Date(Date.UTC(year, monthNumber - 1, 1)),
    to: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

export async function GET(request) {
  const user = currentUser();
  if (!user) {
    return Response.json({ error: 'Brak autoryzacji.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');
  const range = monthRange(month);

  if (!range) {
    return Response.json({ error: 'Nieprawidłowy miesiąc.' }, { status: 400 });
  }

  const [ownWork, ownExtra] = await Promise.all([
    prisma.workEntry.findMany({
      where: {
        userId: user.id,
        date: { gte: range.from, lt: range.to },
      },
      select: { companyId: true },
    }),
    prisma.extraOrder.findMany({
      where: {
        userId: user.id,
        date: { gte: range.from, lt: range.to },
      },
      select: { companyId: true },
    }),
  ]);

  const companyIds = [
    ...new Set(
      [...ownWork, ...ownExtra]
        .map((item) => item.companyId)
        .filter(Boolean),
    ),
  ];

  if (companyIds.length === 0) {
    return Response.json({ month, companyIds: [], entries: [] });
  }

  const [workEntries, extraOrders] = await Promise.all([
    prisma.workEntry.findMany({
      where: {
        companyId: { in: companyIds },
        date: { gte: range.from, lt: range.to },
      },
      select: {
        id: true,
        date: true,
        companyId: true,
        userId: true,
        type: true,
        title: true,
        description: true,
        notes: true,
        minutes: true,
        travelMinutes: true,
        createdAt: true,
        company: { select: { name: true } },
        user: { select: { name: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.extraOrder.findMany({
      where: {
        companyId: { in: companyIds },
        date: { gte: range.from, lt: range.to },
      },
      select: {
        id: true,
        date: true,
        companyId: true,
        userId: true,
        type: true,
        title: true,
        description: true,
        minutes: true,
        travelMinutes: true,
        createdAt: true,
        company: { select: { name: true } },
        user: { select: { name: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  const entries = [
    ...workEntries.map((entry) => ({
      id: `work-${entry.id}`,
      source: 'WORK',
      date: entry.date,
      companyId: entry.companyId,
      companyName: entry.company?.name || '-',
      userId: entry.userId,
      workerName: entry.user?.name || '-',
      type: entry.type || '-',
      title: entry.title || '',
      description: entry.description || entry.notes || '',
      minutes: Number(entry.minutes || 0),
      travelMinutes: Number(entry.travelMinutes || 0),
    })),
    ...extraOrders.map((entry) => ({
      id: `extra-${entry.id}`,
      source: 'EXTRA',
      date: entry.date,
      companyId: entry.companyId,
      companyName: entry.company?.name || '-',
      userId: entry.userId,
      workerName: entry.user?.name || 'Nieprzypisany',
      type: entry.type || '-',
      title: entry.title || '',
      description: entry.description || '',
      minutes: Number(entry.minutes || 0),
      travelMinutes: Number(entry.travelMinutes || 0),
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return Response.json({ month, companyIds, entries });
}
