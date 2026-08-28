import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';
import { findCompanyByNormalizedName } from '../../../../lib/companyNames';

function data(b){return {name:String(b.name||'').replace(/\s+/g,' ').trim(),nip:b.nip||null,address:b.address||null,contactPerson:b.contactPerson||null,phone:b.phone||null,email:b.email||null,serviceType:b.serviceType||null,status:b.status||'ACTIVE',billingType:b.billingType||'MONTHLY',netAmount:Number(b.netAmount||0),travelCost:Number(b.travelCost||0),extraCost:Number(b.extraCost||0),extraCostDescription:b.extraCostDescription||null,latitude:b.latitude===''||b.latitude==null?null:Number(b.latitude),longitude:b.longitude===''||b.longitude==null?null:Number(b.longitude),regon:b.regon||null,krs:b.krs||null,dataSource:b.dataSource||null,geocodedAt:b.geocodedAt?new Date(b.geocodedAt):null,assignedUserId:b.assignedUserId||null}}

export async function PUT(req,{params}){
  const user=await currentUser();
  if(!user||user.role!=='ADMIN')return Response.json({error:'Forbidden'},{status:403});
  const before=await prisma.company.findUnique({where:{id:params.id}});
  if(!before)return Response.json({error:'Nie znaleziono firmy.'},{status:404});
  const body=await req.json();
  const payload=data(body);
  if(!payload.name)return Response.json({error:'Wpisz nazwę firmy.'},{status:400});

  const duplicate=await findCompanyByNormalizedName(prisma,payload.name,params.id);
  if(duplicate){
    return Response.json({error:`Firma „${duplicate.name}” już istnieje. Nie można utworzyć duplikatu.`},{status:409});
  }

  const company=await prisma.company.update({where:{id:params.id},data:payload,include:{assignedUser:{select:{id:true,name:true,email:true}}}});
  await prisma.auditLog.create({data:{userId:user.id,action:'UPDATE',entity:'Company',entityId:company.id,before,after:company}});
  return Response.json(company);
}

export async function DELETE(req,{params}){
  const user=await currentUser();
  if(!user||user.role!=='ADMIN')return Response.json({error:'Forbidden'},{status:403});
  const before=await prisma.company.findUnique({where:{id:params.id}});
  if(!before)return Response.json({error:'Nie znaleziono firmy.'},{status:404});
  await prisma.company.delete({where:{id:params.id}});
  await prisma.auditLog.create({data:{userId:user.id,action:'DELETE',entity:'Company',entityId:params.id,before}});
  return Response.json({ok:true});
}
