import { prisma } from '../../../../lib/prisma';
import { currentUser, hashPassword } from '../../../../lib/auth';
export async function POST(req) {
  const user = currentUser();
  if (!user || user.role !== 'ADMIN') return Response.json({ error:'Forbidden' }, { status:403 });
  const body = await req.json();
  const updated = await prisma.user.update({ where:{ id: body.id }, data:{ passwordHash: await hashPassword(body.password) }, select:{ id:true, email:true, name:true, role:true }});
  await prisma.auditLog.create({ data:{ userId:user.id, action:'RESET_PASSWORD', entity:'User', entityId:updated.id } });
  return Response.json({ ok:true });
}
