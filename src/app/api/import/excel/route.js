import ExcelJS from 'exceljs';
import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.text) return String(v.text);
    if (v.result) return String(v.result);
    if (v.richText) return v.richText.map(x => x.text).join('');
    if (v.hyperlink && v.text) return String(v.text);
  }
  return String(v);
}

function norm(v) {
  return cellText(v).trim();
}

function num(v) {
  const cleaned = norm(v)
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function key(s) {
  return norm(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function employeeByName(raw) {
  const value = key(raw);
  if (!value) return null;

  const target = value === 'biuro' ? 'arkadiusz zrebiec' : value;

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true }
  });

  return users.find(u =>
    key(u.name).includes(target) ||
    target.includes(key(u.name)) ||
    key(u.email).includes(target)
  ) || null;
}

export async function POST(req) {
  try {
    const user = await currentUser();

    if (!user || user.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const fd = await req.formData();
    const file = fd.get('file');

    if (!file) {
      return Response.json({ error: 'Brak pliku Excel.' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const ws = wb.worksheets[0];

    if (!ws) {
      return Response.json({ error: 'Plik Excel nie ma arkusza.' }, { status: 400 });
    }

    let created = 0;
    let updated = 0;

    const headers = [];

    ws.getRow(1).eachCell((cell, i) => {
      headers[i] = key(cell.value);
    });

    function val(row, names) {
      const wanted = names.map(n => key(n));

      const idx = headers.findIndex(h =>
        h && wanted.some(n => h.includes(n))
      );

      return idx >= 1 ? row.getCell(idx).value : null;
    }

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);

      const name = norm(val(row, ['Nazwa firmy', 'firma', 'nazwa']));

      if (!name) continue;

      const employeeRaw = norm(val(row, ['Pracownik', 'BIURO', 'osoba']));
      const employee = await employeeByName(employeeRaw);

      const payload = {
        name,
        nip: norm(val(row, ['NIP'])) || null,
        netAmount: num(val(row, ['Kwota', 'Kwota netto'])),
        serviceType: 'BHP',
        extraCostDescription: norm(val(row, ['Uwagi'])) || null,
        status: 'ACTIVE',
        billingType: 'MONTHLY',
        assignedUserId: employee?.id || null
      };

      const existing = await prisma.company.findFirst({
        where: {
          name: {
            equals: name,
            mode: 'insensitive'
          }
        }
      });

      if (existing) {
        await prisma.company.update({
          where: { id: existing.id },
          data: payload
        });
        updated++;
      } else {
        await prisma.company.create({
          data: payload
        });
        created++;
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'IMPORT_EXCEL',
        entity: 'Company',
        after: { created, updated }
      }
    });

    return new Response(
      `<html><body style="font-family:Calibri;padding:30px">
        <h1>Import zakończony</h1>
        <p>Dodano: ${created}, zaktualizowano: ${updated}</p>
        <a href="/">Wróć do aplikacji</a>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  } catch (err) {
    console.error('IMPORT EXCEL ERROR:', err);

    return Response.json(
      {
        error: 'Nie udało się zaimportować pliku.',
        details: String(err.message || err)
      },
      { status: 500 }
    );
  }
}
