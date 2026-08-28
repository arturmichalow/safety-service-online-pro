export function normalizeCompanyName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('pl-PL')
    .replace(/\s+/g, '');
}

export async function findCompanyByNormalizedName(client, name, excludeId = null) {
  const normalized = normalizeCompanyName(name);
  if (!normalized) return null;

  const companies = await client.company.findMany({
    where: excludeId ? { id: { not: excludeId } } : undefined,
    select: { id: true, name: true },
  });

  return companies.find((company) => normalizeCompanyName(company.name) === normalized) || null;
}
