import { prisma } from '../../../lib/prisma';
import { currentUser } from '../../../lib/auth';

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function orderData(body, companyId) {
  return {
    companyId,
    date: body.date ? new Date(body.date) : new Date(),
    title: body.title,
    type: body.type || 'inne',
    description: body.description || null,
    netAmount: Number(body.netAmount || 0),
    travelCost: Number(body.travelCost || 0),
    extraCost: Number(body.extraCost || 0),
    extraCostName: body.extraCostName || null,
    extraCostDescription: body.extraCostDescription || null,
    minutes: Number(body.minutes || 0),
    orderNumber: body.orderNumber || null,
    billingMode: body.billingMode === 'ONE_TIME' ? 'ONE_TIME' : 'MONTHLY',
    status: body.status || 'OPEN'
  };
}

export async function POST(req) {
  try {
    const user = await currentUser();

    if (!user || !['ADMIN', 'WORKER'].includes(user.role)) {
      return Response.json({ error: 'Brak uprawnień.' }, { status: 403 });
    }

    const body = await req.json();
    const companyIds = Array.isArray(body.companyIds)
      ? [...new Set(body.companyIds.filter(Boolean))]
      : body.companyId
        ? [body.companyId]
        : [];

    const newCompanyName = String(body.newCompanyName || '').trim().replace(/\s+/g, ' ');
    const minutes = Number(body.minutes || 0);
    const isNewForm = Array.isArray(body.companyIds) || body.billingMode !== undefined;
    const billingMode = body.billingMode === 'ONE_TIME' || (!isNewForm && Number(body.netAmount || 0) > 0) ? 'ONE_TIME' : 'MONTHLY';

    if (isNewForm && !body.date) {
      return Response.json({ error: 'Wybierz datę zlecenia.' }, { status: 400 });
    }

    if (!body.title || !body.type) {
      return Response.json({ error: 'Wybierz rodzaj wykonywanej czynności.' }, { status: 400 });
    }

    if (isNewForm && !String(body.description || '').trim()) {
      return Response.json({ error: 'Wpisz krótki opis wykonywanych prac.' }, { status: 400 });
    }

    if (isNewForm && minutes <= 0) {
      return Response.json({ error: 'Wpisz prawidłowy czas pracy.' }, { status: 400 });
    }

    if (isNewForm && billingMode === 'ONE_TIME' && Number(body.netAmount || 0) <= 0) {
      return Response.json({ error: 'Wpisz kwotę netto za zlecenie.' }, { status: 400 });
    }

    if (isNewForm && Number(body.extraCost || 0) > 0 && !String(body.extraCostName || '').trim()) {
      return Response.json({ error: 'Wpisz nazwę dodatkowego kosztu.' }, { status: 400 });
    }

    if (newCompanyName) {
      const companies = await prisma.company.findMany({ select: { id: true, name: true } });
      const duplicate = companies.find(company => normalizeName(company.name) === normalizeName(newCompanyName));

      if (duplicate) {
        return Response.json(
          { error: 'Firma już istnieje w bazie. Wybierz ją z listy.' },
          { status: 400 }
        );
      }

      const createdCompany = await prisma.company.create({
        data: {
          name: newCompanyName,
          status: 'ACTIVE',
          billingType: billingMode === 'ONE_TIME' ? 'ONE_TIME' : 'MONTHLY',
          netAmount: 0,
          travelCost: Number(body.travelCost || 0),
          extraCost: 0
        }
      });

      companyIds.push(createdCompany.id);
    }

    const uniqueCompanyIds = [...new Set(companyIds)];

    if (uniqueCompanyIds.length === 0) {
      return Response.json(
        { error: 'Wybierz co najmniej jedną firmę albo wpisz nową firmę.' },
        { status: 400 }
      );
    }

    const existingCompanies = await prisma.company.findMany({
      where: { id: { in: uniqueCompanyIds } },
      select: { id: true }
    });

    if (existingCompanies.length !== uniqueCompanyIds.length) {
      return Response.json({ error: 'Jedna z wybranych firm nie istnieje.' }, { status: 400 });
    }

    const orders = await prisma.$transaction(
      uniqueCompanyIds.map(companyId =>
        prisma.extraOrder.create({
          data: orderData(
            {
              ...body,
              billingMode,
              netAmount: billingMode === 'ONE_TIME' ? Number(body.netAmount || 0) : 0,
              extraCost: billingMode === 'ONE_TIME' ? Number(body.extraCost || 0) : 0,
              extraCostName: billingMode === 'ONE_TIME' ? body.extraCostName : null,
              extraCostDescription: billingMode === 'ONE_TIME' ? body.extraCostDescription : null
            },
            companyId
          ),
          include: { company: true }
        })
      )
    );

    await Promise.all(orders.map(order =>
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'CREATE',
          entity: 'ExtraOrder',
          entityId: order.id,
          after: order
        }
      })
    ));

    return Response.json({ count: orders.length, orders });
  } catch (error) {
    console.error('CREATE EXTRA ORDERS ERROR:', error);
    return Response.json(
      { error: error?.message || 'Nie udało się zapisać zlecenia.' },
      { status: 500 }
    );
  }
}
