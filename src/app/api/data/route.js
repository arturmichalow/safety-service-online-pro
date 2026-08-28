import { prisma } from '../../../lib/prisma';
import { currentUser } from '../../../lib/auth';
export async function GET(){
 const user=currentUser(); if(!user) return Response.json({error:'Unauthorized'},{status:401});
 const fullRead=user.role==='ADMIN'||user.permissions?.executiveView===true;
 const companies=await prisma.company.findMany({include:{assignedUser:{select:{id:true,name:true,email:true}}},orderBy:{name:'asc'}});
 const where=fullRead?{}:{userId:user.id};
 const extraOrderWhere=fullRead?{}:{userId:user.id};
 const extraOrders=await prisma.extraOrder.findMany({where:extraOrderWhere,include:{company:{include:{assignedUser:{select:{id:true,name:true,email:true}}}},user:{select:{id:true,name:true,email:true,role:true}}},orderBy:{date:'desc'}});
 const workEntries=await prisma.workEntry.findMany({where,include:{company:true,user:{select:{id:true,name:true,email:true,role:true}}},orderBy:{date:'desc'}});
 const absenceWhere=fullRead?{}:{userId:user.id};
 const absences=await prisma.absence.findMany({where:absenceWhere,include:{user:{select:{id:true,name:true,email:true,role:true}}},orderBy:[{dateFrom:'desc'},{createdAt:'desc'}]});
 const users=fullRead?await prisma.user.findMany({select:{id:true,email:true,name:true,role:true,active:true,hourlyCost:true,permissions:true},orderBy:{name:'asc'}}):[];
 const stripCompanyFinancials=company=>{if(!company)return company;const {netAmount,travelCost,extraCost,extraCostDescription,billingType,...safe}=company;return safe};
 const safeCompanies=fullRead?companies:companies.map(stripCompanyFinancials);
 const safeWorkEntries=fullRead?workEntries:workEntries.map(entry=>({...entry,company:stripCompanyFinancials(entry.company)}));
 const safeExtraOrders=fullRead?extraOrders:extraOrders.map(order=>({...order,company:stripCompanyFinancials(order.company)}));
 return Response.json({companies:safeCompanies,workEntries:safeWorkEntries,extraOrders:safeExtraOrders,absences,users});
}
