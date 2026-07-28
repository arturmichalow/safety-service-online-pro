import { prisma } from '../../../../../lib/prisma';
import { currentUser } from '../../../../../lib/auth';

const USER_AGENT = 'Safety-Service-Online-Pro/1.0 (biuro@safety-service.pl)';

function compactAddress(address = {}) {
  const street = [address.road, address.house_number].filter(Boolean).join(' ');
  const city = address.city || address.town || address.village || address.municipality || address.county;
  const parts = [street, address.postcode, city, address.state].filter(Boolean);
  return parts.join(', ');
}

async function findLocation(company) {
  const queries = [];
  if (company.address) queries.push(`${company.name}, ${company.address}, Polska`);
  queries.push(`${company.name}, Polska`);

  for (const query of queries) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '5');
    url.searchParams.set('countrycodes', 'pl');

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'pl'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Usługa lokalizacji zwróciła błąd ${response.status}.`);
    }

    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) continue;

    const normalizedName = String(company.name || '').toLocaleLowerCase('pl-PL');
    const best = results.find(item =>
      String(item.display_name || '').toLocaleLowerCase('pl-PL').includes(normalizedName)
    ) || results[0];

    return best;
  }

  return null;
}

export async function POST(req, { params }) {
  const user = currentUser();
  if (!user || user.role !== 'ADMIN') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const company = await prisma.company.findUnique({ where: { id: params.id } });
  if (!company) {
    return Response.json({ error: 'Nie znaleziono firmy.' }, { status: 404 });
  }

  try {
    const found = await findLocation(company);
    if (!found) {
      return Response.json({
        status: 'NOT_FOUND',
        companyId: company.id,
        companyName: company.name,
        error: 'Nie znaleziono wiarygodnej lokalizacji po nazwie firmy.'
      }, { status: 404 });
    }

    const latitude = Number(found.lat);
    const longitude = Number(found.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return Response.json({ error: 'Usługa zwróciła nieprawidłowe współrzędne.' }, { status: 502 });
    }

    const detectedAddress = compactAddress(found.address) || found.display_name || null;
    const before = company;
    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        latitude,
        longitude,
        address: company.address || detectedAddress,
        dataSource: 'OPENSTREETMAP_NOMINATIM',
        geocodedAt: new Date()
      },
      include: { assignedUser: { select: { id: true, name: true, email: true } } }
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'AUTOFILL_LOCATION',
        entity: 'Company',
        entityId: company.id,
        before,
        after: updated
      }
    });

    return Response.json({
      status: 'UPDATED',
      company: updated,
      matchedName: found.display_name || null
    });
  } catch (error) {
    console.error('Company autofill error:', error);
    return Response.json({ error: error.message || 'Nie udało się pobrać danych firmy.' }, { status: 502 });
  }
}
