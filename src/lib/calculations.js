export const DAILY_WORK_NORM_MINUTES = 450;
export const DEFAULT_MONTHLY_HOURLY_COST = 150;
export const DEFAULT_EXTRA_HOURLY_COST = 250;

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(toNumber(minutes)));
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

export function resolveHourlyCost(user, fallback = DEFAULT_MONTHLY_HOURLY_COST) {
  const custom = user?.hourlyCost == null || user?.hourlyCost === '' ? null : toNumber(user.hourlyCost, 0);
  return custom && custom > 0 ? custom : fallback;
}

export function costForMinutes(minutes, hourlyCost) {
  return (toNumber(minutes) / 60) * toNumber(hourlyCost);
}

export function marginPercent(profit, revenue) {
  const rev = toNumber(revenue);
  return rev ? (toNumber(profit) / rev) * 100 : 0;
}

export function dateKey(value) {
  return String(value || '').slice(0, 10);
}

export function businessDateList(from, to, today = new Date().toISOString().slice(0, 10)) {
  const effectiveTo = to > today ? today : to;
  if (!from || !effectiveTo || from > effectiveTo) return [];
  const parse = iso => {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  };
  const out = [];
  const cursor = parse(from);
  const end = parse(effectiveTo);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) out.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function absenceMinutesForDate(absences, date, approvedOnly = true, normMinutes = DAILY_WORK_NORM_MINUTES) {
  return Math.min(normMinutes, (absences || [])
    .filter(a => (!approvedOnly || a.status === 'APPROVED') && dateKey(a.dateFrom) <= date && dateKey(a.dateTo) >= date)
    .reduce((sum, a) => sum + toNumber(a.minutes), 0));
}

export function buildDailyWorkReport({ entries = [], extraOrders = [], absences = [], userId, dateFrom, dateTo, normMinutes = DAILY_WORK_NORM_MINUTES }) {
  const dates = businessDateList(dateFrom, dateTo);
  const grouped = new Map();
  const add = entry => {
    if (entry.userId !== userId) return;
    const date = dateKey(entry.date);
    if (date < dateFrom || date > dateTo) return;
    const row = grouped.get(date) || { work: 0, travel: 0, entries: 0, companies: new Set() };
    row.work += toNumber(entry.minutes);
    row.travel += toNumber(entry.travelMinutes);
    row.entries += 1;
    const companyName = entry.company?.name || entry.companyName;
    if (companyName) row.companies.add(companyName);
    grouped.set(date, row);
  };
  entries.forEach(add);
  extraOrders.forEach(add);

  return dates.map(date => {
    const row = grouped.get(date) || { work: 0, travel: 0, entries: 0, companies: new Set() };
    const absence = absenceMinutesForDate(absences.filter(a => a.userId === userId), date, true, normMinutes);
    const pending = absences.filter(a => a.userId === userId && a.status === 'PENDING' && dateKey(a.dateFrom) <= date && dateKey(a.dateTo) >= date);
    const accounted = row.work + row.travel + absence;
    const missing = Math.max(0, normMinutes - accounted);
    let status = 'OK';
    if (absence >= normMinutes && row.work + row.travel === 0) status = 'ABSENCE';
    else if (missing === normMinutes) status = 'NO_ENTRY';
    else if (missing > 0) status = 'MISSING';
    return { ...row, date, absence, pending, accounted, missing, norm: normMinutes, status, companies: [...row.companies].join(', ') || '-' };
  }).sort((a, b) => b.date.localeCompare(a.date));
}
