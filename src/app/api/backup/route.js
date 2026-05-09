import { prisma } from '../../../lib/prisma';
import { currentUser } from '../../../lib/auth';
export async function GET() {
  const user = currentUser();
  if (!user || user.role !== 'ADMIN') return Response.json({error:'Forbidden'}, {status:403});
  const [companies, workEntries, users, auditLogs] = await Promise.all([prisma.company.findMany(), prisma.workEntry.findMany(), prisma.user.findMany({ select:{id:true,email:true,name:true,role:true,active:true,createdAt:true} }), prisma.auditLog.findMany({ take:1000, orderBy:{createdAt:'desc'} })]);
  const data = { exportedAt:new Date().toISOString(), companies, workEntries, users, auditLogs };
  return new Response(JSON.stringify(data,null,2), { headers: { 'Content-Type':'application/json', 'Content-Disposition':'attachment; filename="backup_safety_service.json"' } });
}
