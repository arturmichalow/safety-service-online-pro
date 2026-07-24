import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

async function getAuthorizedEntry(id,user){
 const entry=await prisma.workEntry.findUnique({
  where:{
   id
  }
 });

 if(!entry){
  return {
   error:Response.json(
    {error:'Nie znaleziono wpisu.'},
    {status:404}
   )
  };
 }

 const isOwner=entry.userId===user.id;
 const isAdmin=user.role==='ADMIN';

 if(!isOwner&&!isAdmin){
  return {
   error:Response.json(
    {error:'Nie masz uprawnień do tego wpisu.'},
    {status:403}
   )
  };
 }

 return {
  entry
 };
}

export async function PUT(req,{params}){
 const user=await currentUser();

 if(!user){
  return Response.json(
   {error:'Unauthorized'},
   {status:401}
  );
 }

 const authorization=await getAuthorizedEntry(params.id,user);

 if(authorization.error){
  return authorization.error;
 }

 const before=authorization.entry;
 const body=await req.json();

 if(!body.companyId){
  return Response.json(
   {error:'Wybierz firmę.'},
   {status:400}
  );
 }

 const updated=await prisma.workEntry.update({
  where:{
   id:params.id
  },
  data:{
   date:new Date(body.date),
   companyId:body.companyId,
   orderNumber:body.orderNumber||null,
   type:body.type||'inne',
   title:body.title||body.type||'Wpis pracy',
   description:body.description||null,
   minutes:Number(body.minutes||0),
   travelMinutes:Number(body.travelMinutes||0),
   additionalCost:Number(body.additionalCost||0),
   additionalCostDescription:
    body.additionalCostDescription||null
  }
 });

 await prisma.auditLog.create({
  data:{
   userId:user.id,
   action:'UPDATE',
   entity:'WorkEntry',
   entityId:updated.id,
   before,
   after:updated
  }
 });

 return Response.json(updated);
}

export async function DELETE(req,{params}){
 const user=await currentUser();

 if(!user){
  return Response.json(
   {error:'Unauthorized'},
   {status:401}
  );
 }

 const authorization=await getAuthorizedEntry(params.id,user);

 if(authorization.error){
  return authorization.error;
 }

 const before=authorization.entry;

 await prisma.workEntry.delete({
  where:{
   id:params.id
  }
 });

 await prisma.auditLog.create({
  data:{
   userId:user.id,
   action:'DELETE',
   entity:'WorkEntry',
   entityId:before.id,
   before
  }
 });

 return Response.json({
  success:true
 });
}
