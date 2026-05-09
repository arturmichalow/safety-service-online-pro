import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

function data(b){
  return {
    companyId:b.companyId,
    date:b.date?new Date(b.date):undefined,
    title:b.title,
    type:b.type||'inne',
    description:b.description||null,
    netAmount:Number(b.netAmount||0),
    travelCost:Number(b.travelCost||0),
    extraCost:Number(b.extraCost||0),
    extraCostDescription:b.extraCostDescription||null,
    orderNumber:b.orderNumber||null,
    status:b.status||'OPEN'
  }
}
export async function PUT(req,{params}){
  const user=currentUser();
  if(!user||user.role!=='ADMIN') return Response.json({error:'Forbidden'},{status:403});
  const body=await req.json();
  const order=await prisma.extraOrder.update({where:{id:params.id},data:data(body),include:{company:true}});
  await prisma.auditLog.create({data:{userId:user.id,action:'UPDATE',entity:'ExtraOrder',entityId:order.id,after:order}});
  return Response.json(order);
}
export async function DELETE(req,{params}){
  const user=currentUser();
  if(!user||user.role!=='ADMIN') return Response.json({error:'Forbidden'},{status:403});
  await prisma.extraOrder.delete({where:{id:params.id}});
  await prisma.auditLog.create({data:{userId:user.id,action:'DELETE',entity:'ExtraOrder',entityId:params.id}});
  return Response.json({ok:true});
}
