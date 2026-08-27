import { prisma } from '../../../lib/prisma';
import { currentUser } from '../../../lib/auth';
export async function GET(){
 const user=currentUser(); if(!user) return Response.json({error:'Unauthorized'},{status:401});
 const companies=await prisma.company.findMany({include:{assignedUser:{select:{id:true,name:true,email:true}}},orderBy:{name:'asc'}});
 const where=user.role==='ADMIN'?{}:{userId:user.id};
 const extraOrderWhere=user.role==='ADMIN'?{}:{userId:user.id};
 const extraOrders=await prisma.extraOrder.findMany({where:extraOrderWhere,include:{company:{include:{assignedUser:{select:{id:true,name:true,email:true}}}},user:{select:{id:true,name:true,email:true,role:true}}},orderBy:{date:'desc'}});
 const workEntries=await prisma.workEntry.findMany({where,include:{company:true,user:{select:{id:true,name:true,email:true,role:true}}},orderBy:{date:'desc'}});
 const absenceWhere=user.role==='ADMIN'?{}:{userId:user.id};
 const absences=await prisma.absence.findMany({where:absenceWhere,include:{user:{select:{id:true,name:true,email:true,role:true}}},orderBy:[{dateFrom:'desc'},{createdAt:'desc'}]});
 const users=user.role==='ADMIN'?await prisma.user.findMany({select:{id:true,email:true,name:true,role:true,active:true,hourlyCost:true,permissions:true},orderBy:{name:'asc'}}):[];
 const stripCompanyFinancials=company=>{if(!company)return company;const {netAmount,travelCost,extraCost,extraCostDescription,billingType,...safe}=company;return safe};
 const safeCompanies=user.role==='ADMIN'?companies:companies.map(stripCompanyFinancials);
 const safeWorkEntries=user.role==='ADMIN'?workEntries:workEntries.map(entry=>({...entry,company:stripCompanyFinancials(entry.company)}));
 const safeExtraOrders=user.role==='ADMIN'?extraOrders:extraOrders.map(order=>({...order,company:stripCompanyFinancials(order.company)}));
 return Response.json({companies:safeCompanies,workEntries:safeWorkEntries,extraOrders:safeExtraOrders,absences,users});
}
