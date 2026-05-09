import { prisma } from '../../../../lib/prisma';
import { currentUser, hashPassword } from '../../../../lib/auth';

export async function PUT(req,{params}){
  const user=currentUser();
  if(!user||user.role!=='ADMIN') return Response.json({error:'Forbidden'},{status:403});
  const b=await req.json();
  const data={email:b.email,name:b.name,role:b.role||'WORKER',active:b.active==='on'||b.active===true,permissions:b.permissions||{}};
  if(b.password) data.passwordHash=await hashPassword(b.password);
  const updated=await prisma.user.update({where:{id:params.id},data,select:{id:true,email:true,name:true,role:true,active:true,permissions:true}});
  await prisma.auditLog.create({data:{userId:user.id,action:'UPDATE',entity:'User',entityId:updated.id,after:updated}});
  return Response.json(updated);
}

export async function DELETE(req,{params}){
  const user=currentUser();
  if(!user||user.role!=='ADMIN') return Response.json({error:'Forbidden'},{status:403});
  if(user.id===params.id) return Response.json({error:'Nie możesz usunąć aktualnie zalogowanego konta.'},{status:400});
  const target=await prisma.user.findUnique({where:{id:params.id}});
  if(!target) return Response.json({error:'Nie znaleziono użytkownika.'},{status:404});
  await prisma.company.updateMany({where:{assignedUserId:params.id},data:{assignedUserId:null}});
  await prisma.workEntry.deleteMany({where:{userId:params.id}});
  await prisma.auditLog.updateMany({where:{userId:params.id},data:{userId:null}});
  await prisma.user.delete({where:{id:params.id}});
  await prisma.auditLog.create({data:{userId:user.id,action:'DELETE',entity:'User',entityId:params.id,before:{email:target.email,name:target.name}}});
  return Response.json({ok:true});
}
