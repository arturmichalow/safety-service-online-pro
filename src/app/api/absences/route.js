import { prisma } from '../../../lib/prisma';
import { currentUser } from '../../../lib/auth';

const ALLOWED_TYPES = ['VACATION','SICK_LEAVE','CARE','TIME_OFF','OTHER'];

function cleanBody(body){
  const type=String(body.type||'').toUpperCase();
  if(!ALLOWED_TYPES.includes(type)) throw new Error('Nieprawidłowy rodzaj nieobecności.');
  const dateFrom=new Date(body.dateFrom);
  const dateTo=new Date(body.dateTo);
  if(Number.isNaN(dateFrom.getTime())||Number.isNaN(dateTo.getTime())||dateFrom>dateTo) throw new Error('Nieprawidłowy zakres dat.');
  const minutes=Math.max(1,Math.min(480,Number(body.minutes||480)));
  return {type,dateFrom,dateTo,minutes,note:String(body.note||'').trim()||null};
}

export async function GET(){
  const user=currentUser();
  if(!user)return Response.json({error:'Unauthorized'},{status:401});
  const where=user.role==='ADMIN'?{}:{userId:user.id};
  const rows=await prisma.absence.findMany({where,include:{user:{select:{id:true,name:true,email:true}}},orderBy:[{dateFrom:'desc'},{createdAt:'desc'}]});
  return Response.json(rows);
}

export async function POST(req){
  const user=currentUser();
  if(!user)return Response.json({error:'Unauthorized'},{status:401});
  try{
    const body=await req.json();
    const data=cleanBody(body);
    const userId=user.role==='ADMIN'&&body.userId?String(body.userId):user.id;
    const status=user.role==='ADMIN'?String(body.status||'APPROVED').toUpperCase():'PENDING';
    const saved=await prisma.absence.create({data:{...data,userId,status},include:{user:{select:{id:true,name:true,email:true}}}});
    return Response.json(saved,{status:201});
  }catch(error){
    return Response.json({error:error.message||'Nie udało się zapisać nieobecności.'},{status:400});
  }
}
