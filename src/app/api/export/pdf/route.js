import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

function monthRange(month) {
  const m = month || new Date().toISOString().slice(0, 7);
  const start = new Date(`${m}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { month: m, start, end };
}

function money(v) {
  return `${Number(v || 0).toLocaleString('pl-PL')} zł`;
}

function minToText(m) {
  const h = Math.floor((m || 0) / 60);
  const mm = (m || 0) % 60;
  return `${h}h ${mm}m`;
}

export async function GET(req) {
  const user = await currentUser();

  if (!user || !['ADMIN', 'WORKER'].includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const { month, start, end } = monthRange(searchParams.get('month'));

  const entries = await prisma.workEntry.findMany({
    where: {
      date: { gte: start, lt: end },
      ...(user.role === 'WORKER' ? { userId: user.id } : {})
    },
    include: { company: true, user: true },
    orderBy: { date: 'desc' }
  });

  const orders = user.role === 'ADMIN'
    ? await prisma.extraOrder.findMany({
    where: { date: { gte: start, lt: end } },
    include: { company: true },
    orderBy: { date: 'desc' }
  })
    : [];

  const totalMinutes = entries.reduce((s, e) => s + Number(e.minutes || 0), 0);
  const totalCosts = entries.reduce((s, e) => s + Number(e.additionalCost || 0), 0);
  const totalOrders = orders.reduce((s, o) => s + Number(o.netAmount || 0), 0);

  const rows = entries.map(e => `
    <tr>
      <td>${e.date.toISOString().slice(0, 10)}</td>
      <td>${e.company?.name || ''}</td>
      ${user.role === 'ADMIN' ? `<td>${e.user?.name || ''}</td>` : ''}
      <td>${e.title || ''}</td>
      <td>${e.description || ''}</td>
      <td>${minToText(e.minutes || 0)}</td>
      <td>${minToText(e.travelMinutes || 0)}</td>
      ${user.role === 'ADMIN' ? `<td>${money(e.additionalCost || 0)}</td><td>${e.additionalCostDescription || ''}</td>` : ''}
    </tr>
  `).join('');

  const html = `
<html>
<head>
<meta charset="utf-8">
<title>Raport ${month}</title>
<style>
body{font-family:Arial;padding:30px;color:#081724}
h1{margin-bottom:5px}
.box{display:inline-block;border:1px solid #ddd;padding:14px;margin:8px 8px 18px 0;border-radius:8px}
th{background:#132734;color:white}
td,th{border:1px solid #ddd;padding:8px;font-size:12px}
table{border-collapse:collapse;width:100%}
</style>
</head>
<body>
<h1>${user.role === 'ADMIN' ? 'Raport Safety Service' : 'Mój raport pracy'}</h1>
${user.role === 'WORKER' ? `<p><b>Pracownik:</b> ${user.name || user.email || ''}</p>` : ''}
<h2>Miesiąc: ${month}</h2>

<div class="box"><b>Czas pracy</b><br>${minToText(totalMinutes)}</div>
${user.role === 'ADMIN' ? `<div class="box"><b>Koszty dodatkowe</b><br>${money(totalCosts)}</div>
<div class="box"><b>Zlecenia dodatkowe</b><br>${money(totalOrders)}</div>` : ''}
<div class="box"><b>Liczba wpisów</b><br>${entries.length}</div>

<h2>Historia pracy</h2>
<table>
<tr>
<th>Data</th><th>Firma</th>${user.role === 'ADMIN' ? '<th>Użytkownik</th>' : ''}<th>Czynność</th><th>Opis</th><th>Czas</th><th>Dojazd</th>${user.role === 'ADMIN' ? '<th>Koszt</th><th>Opis kosztu</th>' : ''}
</tr>
${rows}
</table>

<script>window.print()</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' }
  });
}
