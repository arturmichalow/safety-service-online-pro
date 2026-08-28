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
  try{
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

    // Najpierw wykorzystujemy już istniejącą firmę po znormalizowanej nazwie.
    // Celowo bez advisory locka: na Railway potrafił powodować błąd przy
    // ręcznym dodawaniu firmy z Panelu pracownika.
    const existingRef=await findCompanyByNormalizedName(prisma,payload.name);
    if(existingRef){
      const existing=await prisma.company.findUnique({
        where:{id:existingRef.id},
        include:{assignedUser:{select:{id:true,name:true,email:true}}}
      });
      return Response.json({...existing,_reused:true},{status:200});
    }

    const company=await prisma.company.create({
      data:payload,
      include:{assignedUser:{select:{id:true,name:true,email:true}}}
    });

    // Audit nie może zablokować utworzenia firmy. Logujemy tylko proste pola.
    try{
      await prisma.auditLog.create({
        data:{
          userId:user.id,
          action:'CREATE',
          entity:'Company',
          entityId:company.id,
          after:{
            id:company.id,
            name:company.name,
            status:company.status,
            billingType:company.billingType,
            assignedUserId:company.assignedUserId||null
          }
        }
      });
    }catch(auditError){
      console.error('Company audit log failed:',auditError);
    }

    return Response.json({...company,_reused:false},{status:201});
  }catch(error){
    console.error('POST /api/companies failed:',error);
    return Response.json({error:'Nie udało się dodać firmy. Spróbuj ponownie.'},{status:500});
  }
}
