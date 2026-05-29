import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

function monthRange(month) {
  const m = month || new Date().toISOString().slice(0, 7);
  const start = new Date(`${m}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { month: m, start, end };
}

function csvSafe(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

export async function GET(req) {
  const user = await currentUser();

  if (!user || user.role !== 'ADMIN') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const { month, start, end } = monthRange(searchParams.get('month'));

  const entries = await prisma.workEntry.findMany({
    where: { date: { gte: start, lt: end } },
    include: { company: true, user: true },
    orderBy: { date: 'desc' }
  });

  const rows = [
    ['Miesiąc', 'Data', 'Firma', 'Użytkownik', 'Czynność', 'Opis', 'Minuty pracy', 'Godziny pracy', 'Dojazd min', 'Koszt dodatkowy', 'Opis kosztu'],
    ...entries.map(e => [
      month,
      e.date.toISOString().slice(0, 10),
      e.company?.name || '',
      e.user?.name || '',
      e.title || '',
      e.description || '',
      e.minutes || 0,
      ((e.minutes || 0) / 60).toFixed(2),
      e.travelMinutes || 0,
      e.additionalCost || 0,
      e.additionalCostDescription || ''
    ])
  ];

  const csv = rows.map(r => r.map(csvSafe).join(';')).join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': `attachment; filename="raport-praca-${month}.csv"`
    }
  });
}
