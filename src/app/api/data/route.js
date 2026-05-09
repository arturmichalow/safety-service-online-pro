import { prisma } from '../../../lib/prisma';
import { currentUser } from '../../../lib/auth';
export async function GET(){
 const user=currentUser(); if(!user) return Response.json({error:'Unauthorized'},{status:401});
 const companies=await prisma.company.findMany({include:{assignedUser:{select:{id:true,name:true,email:true}}},orderBy:{name:'asc'}});
 const where=user.role==='ADMIN'?{}:{userId:user.id};
 const workEntries=await prisma.workEntry.findMany({where,include:{company:true,user:{select:{id:true,name:true,email:true,role:true}}},orderBy:{date:'desc'}});
 const users=user.role==='ADMIN'?await prisma.user.findMany({select:{id:true,email:true,name:true,role:true,active:true,permissions:true},orderBy:{name:'asc'}}):[];
 return Response.json({companies,workEntries,users});
}
