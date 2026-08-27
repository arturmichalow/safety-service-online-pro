import ExcelJS from 'exceljs';
import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';
import { costForMinutes, formatMinutes, marginPercent, resolveHourlyCost } from '../../../../lib/calculations';

function monthRange(month) {
  const m = month || new Date().toISOString().slice(0, 7);
  const start = new Date(`${m}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { month: m, start, end };
}
function getShopMargin(order) {
  const match = String(order.description || '').match(/\[MARZA_SKLEP:([^\]]+)\]/);
  return match ? Number(String(match[1]).replace(',', '.').replace(/[^0-9.-]/g, '')) : Number(order.netAmount || 0);
}
function styleHeader(sheet, range) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132734' } };
  if (range) sheet.autoFilter = range;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function GET(req) {
  const user = await currentUser();
  if (!user || !['ADMIN', 'WORKER'].includes(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const monthInfo = monthRange(searchParams.get('month'));
  const start = searchParams.get('dateFrom') ? new Date(`${searchParams.get('dateFrom')}T00:00:00.000Z`) : monthInfo.start;
  const inclusiveEnd = searchParams.get('dateTo') ? new Date(`${searchParams.get('dateTo')}T00:00:00.000Z`) : null;
  const end = inclusiveEnd ? new Date(inclusiveEnd.getTime() + 86400000) : monthInfo.end;
  const companyId = searchParams.get('companyId') || null;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Safety Service';

  if (user.role === 'WORKER') {
    const entries = await prisma.workEntry.findMany({
      where: { userId: user.id, date: { gte: start, lt: end }, ...(companyId ? { companyId } : {}) },
      include: { company: true }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    });
    const orders = await prisma.extraOrder.findMany({
      where: { userId: user.id, date: { gte: start, lt: end }, ...(companyId ? { companyId } : {}) },
      include: { company: true }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    });
    const sheet = wb.addWorksheet('Moje wpisy');
    sheet.columns = [
      { header: 'Data', key: 'date', width: 14 }, { header: 'Firma', key: 'company', width: 30 },
      { header: 'Czynność', key: 'type', width: 22 }, { header: 'Opis', key: 'description', width: 52 },
      { header: 'Czas pracy', key: 'work', width: 16 }, { header: 'Czas pracy w minutach', key: 'workMinutes', width: 20 },
      { header: 'Dojazd', key: 'travel', width: 16 }, { header: 'Dojazd w minutach', key: 'travelMinutes', width: 18 },
      { header: 'Łączny czas', key: 'total', width: 16 }, { header: 'Łączny czas w minutach', key: 'totalMinutes', width: 22 },
      { header: 'Numer zlecenia / PO', key: 'orderNumber', width: 22 }
    ];
    [...entries.map(e => ({ ...e, source: 'WORK' })), ...orders.map(e => ({ ...e, source: 'EXTRA' }))]
      .sort((a, b) => a.date - b.date).forEach(e => {
        const workMinutes = Number(e.minutes || 0), travelMinutes = Number(e.travelMinutes || 0), totalMinutes = workMinutes + travelMinutes;
        sheet.addRow({ date: e.date.toISOString().slice(0, 10), company: e.company?.name || '', type: e.type || e.title || '', description: e.description || e.title || '', work: formatMinutes(workMinutes), workMinutes, travel: formatMinutes(travelMinutes), travelMinutes, total: formatMinutes(totalMinutes), totalMinutes, orderNumber: e.orderNumber || '' });
      });
    styleHeader(sheet, 'A1:K1');
    sheet.getColumn('description').alignment = { wrapText: true, vertical: 'top' };

    // Przywrócone arkusze z wcześniejszego eksportu pracownika.
    const teamCompanyIds = [...new Set([
      ...entries.map(entry => entry.companyId),
      ...orders.map(order => order.companyId)
    ].filter(Boolean))];

    const [teamWorkEntries, teamExtraOrders] = teamCompanyIds.length
      ? await Promise.all([
          prisma.workEntry.findMany({
            where: { companyId: { in: teamCompanyIds }, date: { gte: start, lt: end } },
            include: { company: true, user: true },
            orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
          }),
          prisma.extraOrder.findMany({
            where: { companyId: { in: teamCompanyIds }, date: { gte: start, lt: end } },
            include: { company: true, user: true },
            orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
          })
        ])
      : [[], []];

    const teamRows = [
      ...teamWorkEntries.map(entry => ({
        date: entry.date,
        company: entry.company?.name || '',
        worker: entry.user?.name || entry.user?.email || '',
        type: entry.type || entry.title || '',
        description: entry.description || entry.notes || entry.title || '',
        minutes: Number(entry.minutes || 0),
        travelMinutes: Number(entry.travelMinutes || 0),
        source: 'Obsługa miesięczna',
        orderNumber: entry.orderNumber || ''
      })),
      ...teamExtraOrders.map(order => ({
        date: order.date,
        company: order.company?.name || '',
        worker: order.user?.name || order.user?.email || 'Nieprzypisany',
        type: order.type || order.title || '',
        description: order.description || order.title || '',
        minutes: Number(order.minutes || 0),
        travelMinutes: Number(order.travelMinutes || 0),
        source: 'Zlecenie dodatkowe',
        orderNumber: order.orderNumber || ''
      }))
    ].sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      const companyDiff = a.company.localeCompare(b.company, 'pl');
      if (companyDiff !== 0) return companyDiff;
      return a.worker.localeCompare(b.worker, 'pl');
    });

    const teamSheet = wb.addWorksheet('Czynności zespołu');
    teamSheet.columns = [
      { header: 'Data', key: 'date', width: 16 },
      { header: 'Firma', key: 'company', width: 32 },
      { header: 'Pracownik', key: 'worker', width: 26 },
      { header: 'Rodzaj pracy', key: 'type', width: 22 },
      { header: 'Opis', key: 'description', width: 55 },
      { header: 'Czas pracy', key: 'time', width: 16 },
      { header: 'Minuty pracy', key: 'minutes', width: 16 },
      { header: 'Dojazd', key: 'travel', width: 16 },
      { header: 'Rodzaj wpisu', key: 'source', width: 22 },
      { header: 'Numer zlecenia / PO', key: 'orderNumber', width: 22 }
    ];
    teamRows.forEach(row => teamSheet.addRow({
      date: row.date.toISOString().slice(0, 10), company: row.company, worker: row.worker,
      type: row.type, description: row.description, time: formatMinutes(row.minutes), minutes: row.minutes,
      travel: row.travelMinutes ? formatMinutes(row.travelMinutes) : '-', source: row.source, orderNumber: row.orderNumber
    }));
    styleHeader(teamSheet, 'A1:J1');
    teamSheet.getColumn('description').alignment = { wrapText: true, vertical: 'top' };

    const stats = wb.addWorksheet('Podsumowanie');
    const totalMinutes = entries.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0) + orders.reduce((sum, order) => sum + Number(order.minutes || 0), 0);
    const totalTravelMinutes = entries.reduce((sum, entry) => sum + Number(entry.travelMinutes || 0), 0) + orders.reduce((sum, order) => sum + Number(order.travelMinutes || 0), 0);
    const companyCount = new Set([...entries, ...orders].map(item => item.companyId).filter(Boolean)).size;
    stats.addRows([
      ['Raport pracownika', user.name || user.email || 'Pracownik'],
      ['Okres', `${start.toISOString().slice(0, 10)} - ${new Date(end.getTime() - 86400000).toISOString().slice(0, 10)}`],
      ['Liczba wpisów', entries.length + orders.length],
      ['Liczba firm', companyCount],
      ['Łączny czas pracy', formatMinutes(totalMinutes)],
      ['Łączny czas dojazdów', formatMinutes(totalTravelMinutes)]
    ]);
    stats.getColumn(1).width = 28;
    stats.getColumn(2).width = 36;
    stats.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    stats.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132734' } };

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="moje_wpisy_${monthInfo.month}.xlsx"` } });
  }

  const companyWhere = companyId ? { id: companyId } : {};
  const companies = await prisma.company.findMany({ where: companyWhere, orderBy: { name: 'asc' } });
  const ids = companies.map(c => c.id);
  const [entries, orders] = await Promise.all([
    prisma.workEntry.findMany({ where: { companyId: { in: ids }, date: { gte: start, lt: end } }, include: { company: true, user: { select: { id: true, name: true, email: true, hourlyCost: true } } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    prisma.extraOrder.findMany({ where: { companyId: { in: ids }, date: { gte: start, lt: end } }, include: { company: true, user: { select: { id: true, name: true, email: true, hourlyCost: true } } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] })
  ]);

  const summaries = new Map();
  for (const company of companies) {
    const cEntries = entries.filter(e => e.companyId === company.id);
    const cOrders = orders.filter(o => o.companyId === company.id);
    const trainings = cOrders.filter(o => String(o.type || '').toLowerCase() === 'szkolenie wstępne');
    const normalOrders = cOrders.filter(o => String(o.type || '').toLowerCase() !== 'szkolenie wstępne');
    const shopOrders = normalOrders.filter(o => String(o.type || '').toLowerCase() === 'zlecenie sklep');
    const regularOrders = normalOrders.filter(o => String(o.type || '').toLowerCase() !== 'zlecenie sklep');
    const hasMonthly = Number(company.netAmount || 0) > 0 || String(company.billingType || '').toUpperCase() === 'MONTHLY';
    const revenue = Number(company.netAmount || 0) + regularOrders.reduce((s, o) => s + Number(o.netAmount || 0), 0) + shopOrders.reduce((s, o) => s + getShopMargin(o), 0) + (hasMonthly ? 0 : trainings.reduce((s, o) => s + Number(o.netAmount || 0), 0));
    const workMinutes = cEntries.reduce((s, e) => s + Number(e.minutes || 0), 0) + cOrders.reduce((s, o) => s + Number(o.minutes || 0), 0);
    const travelMinutes = cEntries.reduce((s, e) => s + Number(e.travelMinutes || 0), 0) + cOrders.reduce((s, o) => s + Number(o.travelMinutes || 0), 0);
    const timeCost = cEntries.reduce((s, e) => s + costForMinutes(Number(e.minutes || 0) + Number(e.travelMinutes || 0), resolveHourlyCost(e.user, 150)), 0)
      + normalOrders.reduce((s, o) => s + costForMinutes(Number(o.minutes || 0) + Number(o.travelMinutes || 0), resolveHourlyCost(o.user, 250)), 0)
      + trainings.reduce((s, o) => s + costForMinutes(Number(o.minutes || 0) + Number(o.travelMinutes || 0), resolveHourlyCost(o.user, hasMonthly ? 150 : 250)), 0);
    const extraCosts = Number(company.travelCost || 0) + Number(company.extraCost || 0) + cEntries.reduce((s, e) => s + Number(e.additionalCost || 0), 0) + normalOrders.reduce((s, o) => s + Number(o.travelCost || 0) + Number(o.extraCost || 0), 0);
    const profit = revenue - timeCost - extraCosts;
    summaries.set(company.id, { company, revenue, workMinutes, travelMinutes, totalMinutes: workMinutes + travelMinutes, timeCost, extraCosts, totalCost: timeCost + extraCosts, profit, margin: marginPercent(profit, revenue) });
  }

  const sheet = wb.addWorksheet('Wpisy');
  sheet.columns = [
    { header: 'Data', key: 'date', width: 14 }, { header: 'Firma', key: 'company', width: 30 }, { header: 'Użytkownik', key: 'user', width: 24 },
    { header: 'Czynność', key: 'type', width: 22 }, { header: 'Opis', key: 'description', width: 50 },
    { header: 'Czas pracy', key: 'work', width: 14 }, { header: 'Czas pracy w minutach', key: 'workMinutes', width: 20 },
    { header: 'Dojazd', key: 'travel', width: 14 }, { header: 'Dojazd w minutach', key: 'travelMinutes', width: 18 },
    { header: 'Łączny czas', key: 'total', width: 14 }, { header: 'Łączny czas w minutach', key: 'totalMinutes', width: 22 },
    { header: 'Koszt godziny pracownika', key: 'hourlyCost', width: 22 }, { header: 'Koszt czasu pracy', key: 'workCost', width: 18 },
    { header: 'Koszt dojazdu', key: 'travelCostTime', width: 18 }, { header: 'Łączny koszt czasu pracownika', key: 'totalTimeCost', width: 26 },
    { header: 'Koszt dodatkowy', key: 'additionalCost', width: 18 }, { header: 'Opis kosztu', key: 'additionalCostDescription', width: 30 },
    { header: 'Numer zlecenia / PO', key: 'orderNumber', width: 22 }, { header: 'Przychód klienta / okres', key: 'revenue', width: 24 },
    { header: 'Wynik klienta', key: 'profit', width: 18 }, { header: 'Marża %', key: 'margin', width: 14 }
  ];
  const combined = [
    ...entries.map(e => ({ ...e, source: 'WORK', extra: Number(e.additionalCost || 0), extraDescription: e.additionalCostDescription || '', fallback: 150 })),
    ...orders.map(o => { const company=companies.find(c=>c.id===o.companyId); const monthly=Number(company?.netAmount||0)>0||String(company?.billingType||'').toUpperCase()==='MONTHLY'; const training=String(o.type||'').toLowerCase()==='szkolenie wstępne'; return ({ ...o, source: 'EXTRA', extra: Number(o.travelCost || 0) + Number(o.extraCost || 0), extraDescription: o.extraCostDescription || '', fallback: training&&monthly?150:250 }); })
  ].sort((a, b) => a.date - b.date);
  combined.forEach(e => {
    const summary = summaries.get(e.companyId); const workMinutes = Number(e.minutes || 0), travelMinutes = Number(e.travelMinutes || 0), totalMinutes = workMinutes + travelMinutes;
    const rate = resolveHourlyCost(e.user, e.fallback); const workCost = costForMinutes(workMinutes, rate), travelCostTime = costForMinutes(travelMinutes, rate);
    sheet.addRow({ date: e.date.toISOString().slice(0, 10), company: e.company?.name || '', user: e.user?.name || e.user?.email || 'Nieprzypisany', type: e.type || e.title || '', description: e.description || e.title || '', work: formatMinutes(workMinutes), workMinutes, travel: formatMinutes(travelMinutes), travelMinutes, total: formatMinutes(totalMinutes), totalMinutes, hourlyCost: rate, workCost: +workCost.toFixed(2), travelCostTime: +travelCostTime.toFixed(2), totalTimeCost: +(workCost + travelCostTime).toFixed(2), additionalCost: e.extra, additionalCostDescription: e.extraDescription, orderNumber: e.orderNumber || '', revenue: +(summary?.revenue || 0).toFixed(2), profit: +(summary?.profit || 0).toFixed(2), margin: +(summary?.margin || 0).toFixed(2) });
  });
  styleHeader(sheet, 'A1:U1');
  sheet.getColumn('description').alignment = { wrapText: true, vertical: 'top' };

  const summarySheet = wb.addWorksheet('Podsumowanie');
  summarySheet.columns = [
    { header: 'Firma', key: 'company', width: 30 }, { header: 'Czas pracy', key: 'work', width: 16 }, { header: 'Dojazdy', key: 'travel', width: 16 },
    { header: 'Czas łącznie', key: 'total', width: 16 }, { header: 'Koszt pracy i dojazdów', key: 'timeCost', width: 24 }, { header: 'Koszty dodatkowe', key: 'extraCosts', width: 20 },
    { header: 'Przychód', key: 'revenue', width: 18 }, { header: 'Zysk', key: 'profit', width: 18 }, { header: 'Marża %', key: 'margin', width: 14 }
  ];
  [...summaries.values()].forEach(s => summarySheet.addRow({ company: s.company.name, work: formatMinutes(s.workMinutes), travel: formatMinutes(s.travelMinutes), total: formatMinutes(s.totalMinutes), timeCost: +s.timeCost.toFixed(2), extraCosts: +s.extraCosts.toFixed(2), revenue: +s.revenue.toFixed(2), profit: +s.profit.toFixed(2), margin: +s.margin.toFixed(2) }));
  styleHeader(summarySheet, 'A1:I1');

  // Dodatkowe arkusze przywrócone z wcześniejszego raportu.
  const historySheet = wb.addWorksheet('Historia pracy');
  historySheet.columns = [
    { header: 'Data', key: 'date', width: 16 }, { header: 'Firma', key: 'company', width: 30 },
    { header: 'Użytkownik', key: 'user', width: 24 }, { header: 'Czynność', key: 'title', width: 24 },
    { header: 'Opis', key: 'description', width: 50 }, { header: 'Czas pracy', key: 'time', width: 14 },
    { header: 'Dojazd', key: 'travel', width: 14 }, { header: 'Koszt dodatkowy', key: 'additionalCost', width: 18 },
    { header: 'Opis kosztu', key: 'additionalCostDescription', width: 30 }
  ];
  entries.forEach(e => historySheet.addRow({
    date: e.date.toISOString().slice(0, 10), company: e.company?.name || '',
    user: e.user?.name || e.user?.email || 'Nieprzypisany', title: e.type || e.title || '',
    description: e.description || e.title || '', time: formatMinutes(Number(e.minutes || 0)),
    travel: formatMinutes(Number(e.travelMinutes || 0)), additionalCost: Number(e.additionalCost || 0),
    additionalCostDescription: e.additionalCostDescription || ''
  }));
  styleHeader(historySheet, 'A1:I1');
  historySheet.getColumn('description').alignment = { wrapText: true, vertical: 'top' };

  const ordersSheet = wb.addWorksheet('Zlecenia dodatkowe');
  ordersSheet.columns = [
    { header: 'Data', key: 'date', width: 16 }, { header: 'Firma', key: 'company', width: 30 },
    { header: 'Pracownik', key: 'worker', width: 24 }, { header: 'Nazwa', key: 'title', width: 30 },
    { header: 'Typ', key: 'type', width: 24 }, { header: 'Czas poświęcony', key: 'time', width: 18 },
    { header: 'Dojazd', key: 'travel', width: 16 }, { header: 'Opis', key: 'description', width: 40 },
    { header: 'Kwota netto', key: 'net', width: 16 }, { header: 'Koszt dojazdów', key: 'travelCost', width: 16 },
    { header: 'Dodatkowe koszty', key: 'extraCost', width: 18 }, { header: 'Koszt godziny', key: 'hourlyCost', width: 16 },
    { header: 'Koszt czasu', key: 'timeCost', width: 16 }, { header: 'Opis kosztów', key: 'extraCostDescription', width: 30 },
    { header: 'Zysk', key: 'profit', width: 16 }, { header: 'Status', key: 'status', width: 16 },
    { header: 'Numer zlecenia / PO', key: 'orderNumber', width: 22 }
  ];
  orders.forEach(o => {
    const company = companies.find(c => c.id === o.companyId);
    const hasMonthly = Number(company?.netAmount || 0) > 0 || String(company?.billingType || '').toUpperCase() === 'MONTHLY';
    const training = String(o.type || '').toLowerCase() === 'szkolenie wstępne';
    const fallback = training && hasMonthly ? 150 : 250;
    const rate = resolveHourlyCost(o.user, fallback);
    const minutes = Number(o.minutes || 0), travelMinutes = Number(o.travelMinutes || 0);
    const timeCost = costForMinutes(minutes + travelMinutes, rate);
    const revenue = String(o.type || '').toLowerCase() === 'zlecenie sklep' ? getShopMargin(o) : Number(o.netAmount || 0);
    const profit = revenue - Number(o.travelCost || 0) - Number(o.extraCost || 0) - timeCost;
    ordersSheet.addRow({
      date: o.date.toISOString().slice(0, 10), company: o.company?.name || '',
      worker: o.user?.name || o.user?.email || 'Nieprzypisany', title: o.title || '', type: o.type || '',
      time: formatMinutes(minutes), travel: formatMinutes(travelMinutes), description: o.description || '',
      net: +revenue.toFixed(2), travelCost: Number(o.travelCost || 0), extraCost: Number(o.extraCost || 0),
      hourlyCost: rate, timeCost: +timeCost.toFixed(2), extraCostDescription: o.extraCostDescription || '',
      profit: +profit.toFixed(2), status: o.status || '', orderNumber: o.orderNumber || ''
    });
  });
  styleHeader(ordersSheet, 'A1:Q1');
  ordersSheet.getColumn('description').alignment = { wrapText: true, vertical: 'top' };

  const workersSheet = wb.addWorksheet('Pracownicy');
  workersSheet.columns = [
    { header: 'Pracownik', key: 'worker', width: 28 }, { header: 'Godziny pracy', key: 'hours', width: 16 },
    { header: 'Minuty pracy', key: 'minutes', width: 16 }, { header: 'Dojazdy', key: 'travel', width: 16 },
    { header: 'Czas łącznie', key: 'total', width: 16 }, { header: 'Ilość wpisów', key: 'count', width: 16 },
    { header: 'Koszt godziny', key: 'hourlyCost', width: 16 }, { header: 'Koszt czasu', key: 'timeCost', width: 18 },
    { header: 'Koszty dodatkowe', key: 'costs', width: 18 }
  ];
  const workerMap = new Map();
  combined.forEach(e => {
    const name = e.user?.name || e.user?.email || 'Nieprzypisany';
    const prev = workerMap.get(name) || { worker: name, minutes: 0, travelMinutes: 0, count: 0, costs: 0, timeCost: 0, rates: new Set() };
    const minutes = Number(e.minutes || 0), travelMinutes = Number(e.travelMinutes || 0);
    const rate = resolveHourlyCost(e.user, e.fallback);
    prev.minutes += minutes;
    prev.travelMinutes += travelMinutes;
    prev.count += 1;
    prev.costs += Number(e.extra || 0);
    prev.timeCost += costForMinutes(minutes + travelMinutes, rate);
    prev.rates.add(rate);
    workerMap.set(name, prev);
  });
  [...workerMap.values()].sort((a, b) => (b.minutes + b.travelMinutes) - (a.minutes + a.travelMinutes)).forEach(w => workersSheet.addRow({
    worker: w.worker, hours: formatMinutes(w.minutes), minutes: w.minutes, travel: formatMinutes(w.travelMinutes),
    total: formatMinutes(w.minutes + w.travelMinutes), count: w.count,
    hourlyCost: w.rates.size === 1 ? [...w.rates][0] : 'różne', timeCost: +w.timeCost.toFixed(2), costs: +w.costs.toFixed(2)
  }));
  styleHeader(workersSheet, 'A1:I1');

  const statsSheet = wb.addWorksheet('Statystyki');
  const totalWorkMinutes = combined.reduce((sum, e) => sum + Number(e.minutes || 0), 0);
  const totalTravelMinutes = combined.reduce((sum, e) => sum + Number(e.travelMinutes || 0), 0);
  const totalAdditionalCosts = [...summaries.values()].reduce((sum, item) => sum + item.extraCosts, 0);
  const totalRevenue = [...summaries.values()].reduce((sum, item) => sum + item.revenue, 0);
  const totalTimeCost = [...summaries.values()].reduce((sum, item) => sum + item.timeCost, 0);
  const totalProfit = [...summaries.values()].reduce((sum, item) => sum + item.profit, 0);
  statsSheet.addRows([
    ['Statystyka', 'Wartość'],
    ['Okres raportu', `${start.toISOString().slice(0, 10)} - ${new Date(end.getTime() - 86400000).toISOString().slice(0, 10)}`],
    ['Liczba firm', companies.length],
    ['Liczba wpisów pracy', entries.length],
    ['Liczba zleceń dodatkowych', orders.length],
    ['Suma czasu pracy', formatMinutes(totalWorkMinutes)],
    ['Suma dojazdów', formatMinutes(totalTravelMinutes)],
    ['Suma czasu łącznie', formatMinutes(totalWorkMinutes + totalTravelMinutes)],
    ['Suma kosztu czasu pracowników', +totalTimeCost.toFixed(2)],
    ['Suma kosztów dodatkowych', +totalAdditionalCosts.toFixed(2)],
    ['Przychód łączny', +totalRevenue.toFixed(2)],
    ['Zysk łączny', +totalProfit.toFixed(2)],
    ['Marża łączna %', +marginPercent(totalProfit, totalRevenue).toFixed(2)]
  ]);
  statsSheet.getColumn(1).width = 34;
  statsSheet.getColumn(2).width = 34;
  statsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  statsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132734' } };

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="safety_service_${companyId ? 'klient_' : ''}${monthInfo.month}.xlsx"` } });
}
