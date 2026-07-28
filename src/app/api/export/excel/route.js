import ExcelJS from 'exceljs';
import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

function minToText(m) {
  const h = Math.floor((m || 0) / 60);
  const mm = (m || 0) % 60;
  return `${h}h ${mm}m`;
}

function monthRange(month) {
  const m = month || new Date().toISOString().slice(0, 7);
  const start = new Date(`${m}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { month: m, start, end };
}

export async function GET(req) {
  const user = await currentUser();

  if (!user || !['ADMIN', 'WORKER'].includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const { month, start, end } = monthRange(searchParams.get('month'));


  if (user.role === 'WORKER') {
    const entries = await prisma.workEntry.findMany({
      where: {
        userId: user.id,
        date: { gte: start, lt: end }
      },
      include: { company: true, user: true },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Safety Service';

    const history = wb.addWorksheet('Moje wpisy');
    history.columns = [
      { header: 'Data', key: 'date', width: 16 },
      { header: 'Firma', key: 'company', width: 32 },
      { header: 'Rodzaj pracy', key: 'type', width: 22 },
      { header: 'Opis', key: 'description', width: 55 },
      { header: 'Czas pracy', key: 'time', width: 16 },
      { header: 'Minuty pracy', key: 'minutes', width: 16 },
      { header: 'Dojazd', key: 'travel', width: 16 },
      { header: 'Numer zlecenia / PO', key: 'orderNumber', width: 22 }
    ];

    entries.forEach(entry => {
      history.addRow({
        date: entry.date.toISOString().slice(0, 10),
        company: entry.company?.name || '',
        type: entry.type || entry.title || '',
        description: entry.description || entry.title || '',
        time: minToText(Number(entry.minutes || 0)),
        minutes: Number(entry.minutes || 0),
        travel: minToText(Number(entry.travelMinutes || 0)),
        orderNumber: entry.orderNumber || ''
      });
    });

    history.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    history.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF5A14' } };
    history.autoFilter = 'A1:H1';
    history.views = [{ state: 'frozen', ySplit: 1 }];

    // Firmy, dla których pracownik wykonał co najmniej jeden wpis lub zlecenie
    // w wybranym miesiącu. Na tej podstawie budujemy podgląd pracy całego zespołu.
    const ownExtraOrders = await prisma.extraOrder.findMany({
      where: {
        userId: user.id,
        date: { gte: start, lt: end }
      },
      select: { companyId: true }
    });

    const teamCompanyIds = [...new Set([
      ...entries.map(entry => entry.companyId),
      ...ownExtraOrders.map(order => order.companyId)
    ].filter(Boolean))];

    const [teamWorkEntries, teamExtraOrders] = teamCompanyIds.length
      ? await Promise.all([
          prisma.workEntry.findMany({
            where: {
              companyId: { in: teamCompanyIds },
              date: { gte: start, lt: end }
            },
            include: { company: true, user: true },
            orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
          }),
          prisma.extraOrder.findMany({
            where: {
              companyId: { in: teamCompanyIds },
              date: { gte: start, lt: end }
            },
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

    // Kolejność arkuszy: Moje wpisy -> Czynności zespołu -> Podsumowanie.
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

    teamRows.forEach(row => {
      teamSheet.addRow({
        date: row.date.toISOString().slice(0, 10),
        company: row.company,
        worker: row.worker,
        type: row.type,
        description: row.description,
        time: minToText(row.minutes),
        minutes: row.minutes,
        travel: row.travelMinutes ? minToText(row.travelMinutes) : '-',
        source: row.source,
        orderNumber: row.orderNumber
      });
    });

    teamSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    teamSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132734' } };
    teamSheet.autoFilter = 'A1:J1';
    teamSheet.views = [{ state: 'frozen', ySplit: 1 }];
    teamSheet.getColumn('description').alignment = { wrapText: true, vertical: 'top' };
    teamSheet.getColumn('worker').alignment = { wrapText: true, vertical: 'top' };
    teamSheet.getColumn('source').alignment = { wrapText: true, vertical: 'top' };

    const totalMinutes = entries.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0);
    const totalTravelMinutes = entries.reduce((sum, entry) => sum + Number(entry.travelMinutes || 0), 0);
    const companyCount = new Set(entries.map(entry => entry.companyId).filter(Boolean)).size;

    const stats = wb.addWorksheet('Podsumowanie');
    stats.addRows([
      ['Raport pracownika', user.name || user.email || 'Pracownik'],
      ['Miesiąc', month],
      ['Liczba wpisów', entries.length],
      ['Liczba firm', companyCount],
      ['Łączny czas pracy', minToText(totalMinutes)],
      ['Łączny czas dojazdów', minToText(totalTravelMinutes)]
    ]);
    stats.getColumn(1).width = 28;
    stats.getColumn(2).width = 32;
    stats.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    stats.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132734' } };

    const buffer = await wb.xlsx.writeBuffer();

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="moje_wpisy_${month}.xlsx"`
      }
    });
  }

  const companies = await prisma.company.findMany({
    include: {
      workEntries: {
        where: { date: { gte: start, lt: end } }
      },
      extraOrders: {
        where: { date: { gte: start, lt: end } }
      },
      assignedUser: true
    },
    orderBy: { name: 'asc' }
  });

  const entries = await prisma.workEntry.findMany({
    where: { date: { gte: start, lt: end } },
    include: { company: true, user: true },
    orderBy: { date: 'desc' }
  });

  const orders = await prisma.extraOrder.findMany({
    where: { date: { gte: start, lt: end } },
    include: { company: true },
    orderBy: { date: 'desc' }
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Safety Service';

  const s = wb.addWorksheet('Podsumowanie');

  s.columns = [
    { header: 'Miesiąc', key: 'month', width: 14 },
    { header: 'Firma', key: 'name', width: 30 },
    { header: 'Pracownik', key: 'employee', width: 24 },
    { header: 'Godziny', key: 'hours', width: 16 },
    { header: 'Dojazdy', key: 'travel', width: 16 },
    { header: 'Kwota miesięczna', key: 'monthly', width: 18 },
    { header: 'Zlecenia dodatkowe', key: 'orders', width: 20 },
    { header: 'Koszty', key: 'costs', width: 16 },
    { header: 'Koszt czasu', key: 'timeCost', width: 16 },
    { header: 'Zysk', key: 'profit', width: 16 },
    { header: 'Stawka/h', key: 'rate', width: 16 },
    { header: 'Rentowność', key: 'rent', width: 16 }
  ];

  companies.forEach(c => {
    const workMinutes = c.workEntries.reduce((sum, e) => sum + Number(e.minutes || 0), 0);
    const orderMinutes = c.extraOrders.reduce((sum, o) => sum + Number(o.minutes || 0), 0);
    const minutes = workMinutes + orderMinutes;

    const travel = c.workEntries.reduce((sum, e) => sum + Number(e.travelMinutes || 0), 0);

    const monthly = Number(c.netAmount || 0);
    const ordersNet = c.extraOrders.reduce((sum, o) => sum + Number(o.netAmount || 0), 0);

    const entryCosts = c.workEntries.reduce((sum, e) => sum + Number(e.additionalCost || 0), 0);
    const orderCosts = c.extraOrders.reduce(
      (sum, o) => sum + Number(o.travelCost || 0) + Number(o.extraCost || 0),
      0
    );

    const costs = Number(c.travelCost || 0) + Number(c.extraCost || 0) + entryCosts + orderCosts;
    const timeCost = (minutes / 60) * 150;
    const profit = monthly + ordersNet - costs - timeCost;
    const rate = minutes ? profit / (minutes / 60) : 0;

    const rent =
      profit > 0
        ? rate >= 250
          ? 'Wysoka'
          : 'Średnia'
        : minutes || costs || monthly || ordersNet
          ? 'Niska'
          : 'Brak';

    s.addRow({
      month,
      name: c.name,
      employee: c.assignedUser?.name || '',
      hours: minToText(minutes),
      travel: minToText(travel),
      monthly,
      orders: ordersNet,
      costs,
      timeCost: +timeCost.toFixed(2),
      profit: +profit.toFixed(2),
      rate: +rate.toFixed(2),
      rent
    });
  });

  s.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132734' } };
  s.autoFilter = 'A1:L1';

  const h = wb.addWorksheet('Historia pracy');

  h.columns = [
    { header: 'Data', key: 'date', width: 16 },
    { header: 'Firma', key: 'company', width: 30 },
    { header: 'Użytkownik', key: 'user', width: 22 },
    { header: 'Czynność', key: 'title', width: 24 },
    { header: 'Opis', key: 'description', width: 50 },
    { header: 'Czas pracy', key: 'time', width: 14 },
    { header: 'Dojazd', key: 'travel', width: 14 },
    { header: 'Koszt dodatkowy', key: 'additionalCost', width: 18 },
    { header: 'Opis kosztu', key: 'additionalCostDescription', width: 30 }
  ];

  entries.forEach(e => {
    h.addRow({
      date: e.date.toISOString().slice(0, 10),
      company: e.company?.name || '',
      user: e.user?.name || '',
      title: e.title || '',
      description: e.description || '',
      time: minToText(e.minutes || 0),
      travel: minToText(e.travelMinutes || 0),
      additionalCost: Number(e.additionalCost || 0),
      additionalCostDescription: e.additionalCostDescription || ''
    });
  });

  h.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF5A14' } };
  h.autoFilter = 'A1:I1';

  const z = wb.addWorksheet('Zlecenia dodatkowe');

  z.columns = [
    { header: 'Data', key: 'date', width: 16 },
    { header: 'Firma', key: 'company', width: 30 },
    { header: 'Nazwa', key: 'title', width: 30 },
    { header: 'Typ', key: 'type', width: 24 },
    { header: 'Czas poświęcony', key: 'time', width: 18 },
    { header: 'Opis', key: 'description', width: 40 },
    { header: 'Kwota netto', key: 'net', width: 16 },
    { header: 'Koszt dojazdów', key: 'travelCost', width: 16 },
    { header: 'Dodatkowe koszty', key: 'extraCost', width: 18 },
    { header: 'Koszt czasu', key: 'timeCost', width: 16 },
    { header: 'Opis kosztów', key: 'extraCostDescription', width: 30 },
    { header: 'Zysk', key: 'profit', width: 16 },
    { header: 'Status', key: 'status', width: 16 }
  ];

  orders.forEach(o => {
    const timeCost = (Number(o.minutes || 0) / 60) * 250;
    const profit =
      Number(o.netAmount || 0) -
      Number(o.travelCost || 0) -
      Number(o.extraCost || 0) -
      timeCost;

    z.addRow({
      date: o.date.toISOString().slice(0, 10),
      company: o.company?.name || '',
      title: o.title || '',
      type: o.type || '',
      time: minToText(Number(o.minutes || 0)),
      description: o.description || '',
      net: Number(o.netAmount || 0),
      travelCost: Number(o.travelCost || 0),
      extraCost: Number(o.extraCost || 0),
      timeCost: +timeCost.toFixed(2),
      extraCostDescription: o.extraCostDescription || '',
      profit: +profit.toFixed(2),
      status: o.status || ''
    });
  });

  z.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  z.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132734' } };
  z.autoFilter = 'A1:M1';

  const p = wb.addWorksheet('Pracownicy');

  p.columns = [
    { header: 'Pracownik', key: 'worker', width: 28 },
    { header: 'Godziny pracy', key: 'hours', width: 16 },
    { header: 'Minuty pracy', key: 'minutes', width: 16 },
    { header: 'Dojazdy', key: 'travel', width: 16 },
    { header: 'Ilość wpisów', key: 'count', width: 16 },
    { header: 'Koszty dodatkowe', key: 'costs', width: 18 }
  ];

  const workerMap = new Map();

  entries.forEach(e => {
    const name = e.user?.name || 'Nieznany pracownik';
    const prev = workerMap.get(name) || {
      worker: name,
      minutes: 0,
      travelMinutes: 0,
      count: 0,
      costs: 0
    };

    prev.minutes += Number(e.minutes || 0);
    prev.travelMinutes += Number(e.travelMinutes || 0);
    prev.count += 1;
    prev.costs += Number(e.additionalCost || 0);

    workerMap.set(name, prev);
  });

  [...workerMap.values()]
    .sort((a, b) => b.minutes - a.minutes)
    .forEach(w => {
      p.addRow({
        worker: w.worker,
        hours: minToText(w.minutes),
        minutes: w.minutes,
        travel: minToText(w.travelMinutes),
        count: w.count,
        costs: w.costs
      });
    });

  p.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  p.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF5A14' } };
  p.autoFilter = 'A1:F1';

  const st = wb.addWorksheet('Statystyki');

  const totalWorkMinutes = entries.reduce((x, e) => x + Number(e.minutes || 0), 0);
  const totalTravelMinutes = entries.reduce((x, e) => x + Number(e.travelMinutes || 0), 0);
  const totalAdditionalCosts = entries.reduce((x, e) => x + Number(e.additionalCost || 0), 0);
  const totalOrdersNet = orders.reduce((x, o) => x + Number(o.netAmount || 0), 0);
  const totalMonthly = companies.reduce((x, c) => x + Number(c.netAmount || 0), 0);

  st.addRows([
    ['Statystyka', 'Wartość'],
    ['Miesiąc raportu', month],
    ['Liczba firm', companies.length],
    ['Liczba wpisów pracy', entries.length],
    ['Liczba zleceń dodatkowych', orders.length],
    ['Suma godzin pracy', +(totalWorkMinutes / 60).toFixed(2)],
    ['Suma dojazdów', +(totalTravelMinutes / 60).toFixed(2)],
    ['Suma kosztów dodatkowych', totalAdditionalCosts],
    ['Suma abonamentów miesięcznych', totalMonthly],
    ['Suma zleceń dodatkowych', totalOrdersNet],
    ['Przychód łączny', totalMonthly + totalOrdersNet]
  ]);

  st.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  st.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132734' } };

  const buffer = await wb.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="raport_safety_service_${month}.xlsx"`
    }
  });
}
