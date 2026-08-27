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

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="safety_service_${companyId ? 'klient_' : ''}${monthInfo.month}.xlsx"` } });
}
