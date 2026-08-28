import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';
import { normalizeCompanyName } from '../../../../lib/companyNames';

function valuePresent(value){
  return value!==null&&value!==undefined&&String(value).trim()!=='';
}

function numberValue(value){
  const n=Number(value||0);
  return Number.isFinite(n)?n:0;
}

function companyScore(company){
  const important=['nip','address','contactPerson','phone','email','serviceType','orderNumber','assignedUserId','latitude','longitude','regon','krs'];
  let score=important.reduce((sum,key)=>sum+(valuePresent(company[key])?3:0),0);
  if(numberValue(company.netAmount)!==0)score+=10;
  if(numberValue(company.travelCost)!==0)score+=3;
  if(numberValue(company.extraCost)!==0)score+=3;
  if(valuePresent(company.extraCostDescription))score+=2;
  score+=Number(company._count?.workEntries||0)*0.01;
  score+=Number(company._count?.extraOrders||0)*0.01;
  score+=Number(company._count?.quickNotes||0)*0.01;
  return score;
}

function mergedCompanyData(canonical, group){
  const merged={};
  const fillFields=['nip','address','contactPerson','phone','email','serviceType','orderNumber','assignedUserId','latitude','longitude','regon','krs','dataSource','geocodedAt','extraCostDescription'];
  for(const key of fillFields){
    if(valuePresent(canonical[key]))continue;
    const source=group.find(item=>valuePresent(item[key]));
    if(source)merged[key]=source[key];
  }

  for(const key of ['netAmount','travelCost','extraCost']){
    if(numberValue(canonical[key])!==0)continue;
    const source=group.find(item=>numberValue(item[key])!==0);
    if(source)merged[key]=source[key];
  }

  return merged;
}

function toJson(value){
  return JSON.parse(JSON.stringify(value));
}

export async function POST(){
  const user=await currentUser();
  if(!user||user.role!=='ADMIN')return Response.json({error:'Forbidden'},{status:403});

  const result=await prisma.$transaction(async(tx)=>{
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(88442211)');

    const companies=await tx.company.findMany({
      include:{_count:{select:{workEntries:true,extraOrders:true,quickNotes:true}}},
      orderBy:{createdAt:'asc'}
    });

    const groups=new Map();
    for(const company of companies){
      const key=normalizeCompanyName(company.name);
      if(!key)continue;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(company);
    }

    const duplicateGroups=[...groups.values()].filter(group=>group.length>1);
    let removed=0;
    let workEntriesMoved=0;
    let extraOrdersMoved=0;
    let quickNotesMoved=0;
    const merged=[];

    for(const group of duplicateGroups){
      const sorted=[...group].sort((a,b)=>{
        const diff=companyScore(b)-companyScore(a);
        if(diff!==0)return diff;
        return new Date(a.createdAt)-new Date(b.createdAt);
      });
      const canonical=sorted[0];
      const duplicates=sorted.slice(1);
      const duplicateIds=duplicates.map(item=>item.id);
      const mergeData=mergedCompanyData(canonical,group);

      const workResult=await tx.workEntry.updateMany({where:{companyId:{in:duplicateIds}},data:{companyId:canonical.id}});
      const extraResult=await tx.extraOrder.updateMany({where:{companyId:{in:duplicateIds}},data:{companyId:canonical.id}});
      const noteResult=await tx.quickNote.updateMany({where:{companyId:{in:duplicateIds}},data:{companyId:canonical.id}});

      if(Object.keys(mergeData).length){
        await tx.company.update({where:{id:canonical.id},data:mergeData});
      }

      await tx.company.deleteMany({where:{id:{in:duplicateIds}}});

      await tx.auditLog.create({
        data:{
          userId:user.id,
          action:'MERGE_DUPLICATES',
          entity:'Company',
          entityId:canonical.id,
          before:toJson(group),
          after:{
            canonicalId:canonical.id,
            canonicalName:canonical.name,
            removedIds:duplicateIds,
            workEntriesMoved:workResult.count,
            extraOrdersMoved:extraResult.count,
            quickNotesMoved:noteResult.count
          }
        }
      });

      removed+=duplicates.length;
      workEntriesMoved+=workResult.count;
      extraOrdersMoved+=extraResult.count;
      quickNotesMoved+=noteResult.count;
      merged.push({name:canonical.name,removed:duplicates.length});
    }

    return {groups:duplicateGroups.length,removed,workEntriesMoved,extraOrdersMoved,quickNotesMoved,merged};
  },{timeout:30000});

  return Response.json(result);
}
