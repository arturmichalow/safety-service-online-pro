import { prisma } from '../../../lib/prisma';
import { currentUser } from '../../../lib/auth';
import { findCompanyByNormalizedName } from '../../../lib/companyNames';

function data(b){
  return {
    name:String(b.name||'').replace(/\s+/g,' ').trim(),
    nip:b.nip||null,
    address:b.address||null,
    contactPerson:b.contactPerson||null,
    phone:b.phone||null,
    email:b.email||null,
    serviceType:b.serviceType||null,
    status:b.status||'ACTIVE',
    billingType:b.billingType||'MONTHLY',
    netAmount:Number(b.netAmount||0),
    travelCost:Number(b.travelCost||0),
    extraCost:Number(b.extraCost||0),
    extraCostDescription:b.extraCostDescription||null,
    latitude:b.latitude===''||b.latitude==null?null:Number(b.latitude),
    longitude:b.longitude===''||b.longitude==null?null:Number(b.longitude),
    regon:b.regon||null,
    krs:b.krs||null,
    dataSource:b.dataSource||null,
    geocodedAt:b.geocodedAt?new Date(b.geocodedAt):null,
    assignedUserId:b.assignedUserId||null
  };
}

export async function POST(req){
  const user=await currentUser();
  if(!user||!['ADMIN','WORKER'].includes(user.role)){
    return Response.json({error:'Forbidden'},{status:403});
  }

  const body=await req.json();
  const payload=data(body);
  if(!payload.name){
    return Response.json({error:'Wpisz nazwę firmy.'},{status:400});
  }

  if(user.role!=='ADMIN'){
    payload.netAmount=0;
    payload.travelCost=0;
    payload.extraCost=0;
    payload.extraCostDescription=null;
    payload.billingType='MONTHLY';
    payload.assignedUserId=user.id;
  }

  const result=await prisma.$transaction(async(tx)=>{
    // Blokada zapobiega sytuacji, w której dwie osoby jednocześnie dodadzą tę samą firmę.
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(88442211)');

    const existingRef=await findCompanyByNormalizedName(tx,payload.name);
    if(existingRef){
      const existing=await tx.company.findUnique({
        where:{id:existingRef.id},
        include:{assignedUser:{select:{id:true,name:true,email:true}}}
      });
      return {company:existing,reused:true};
    }

    const company=await tx.company.create({
      data:payload,
      include:{assignedUser:{select:{id:true,name:true,email:true}}}
    });
    await tx.auditLog.create({
      data:{userId:user.id,action:'CREATE',entity:'Company',entityId:company.id,after:company}
    });
    return {company,reused:false};
  });

  return Response.json({...result.company,_reused:result.reused},{status:result.reused?200:201});
}
