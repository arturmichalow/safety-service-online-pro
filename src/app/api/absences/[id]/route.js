import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

const ALLOWED_TYPES = ['VACATION','SICK_LEAVE','CARE','TIME_OFF','OTHER'];
const ALLOWED_STATUS = ['PENDING','APPROVED','REJECTED'];

export async function PUT(req,{params}){
  const user=currentUser();
  if(!user)return Response.json({error:'Unauthorized'},{status:401});
  const current=await prisma.absence.findUnique({where:{id:params.id}});
  if(!current)return Response.json({error:'Nie znaleziono zgłoszenia.'},{status:404});
  if(user.role!=='ADMIN'&&(current.userId!==user.id||current.status!=='PENDING'))return Response.json({error:'Brak uprawnień.'},{status:403});
  try{
    const body=await req.json();
    const data={};
    if(body.type!==undefined){const type=String(body.type).toUpperCase();if(!ALLOWED_TYPES.includes(type))throw new Error('Nieprawidłowy rodzaj.');data.type=type;}
    if(body.dateFrom!==undefined)data.dateFrom=new Date(body.dateFrom);
    if(body.dateTo!==undefined)data.dateTo=new Date(body.dateTo);
    if(data.dateFrom&&data.dateTo&&data.dateFrom>data.dateTo)throw new Error('Nieprawidłowy zakres dat.');
    if(body.minutes!==undefined)data.minutes=Math.max(1,Math.min(480,Number(body.minutes||480)));
    if(body.note!==undefined)data.note=String(body.note||'').trim()||null;
    if(user.role==='ADMIN'&&body.status!==undefined){const status=String(body.status).toUpperCase();if(!ALLOWED_STATUS.includes(status))throw new Error('Nieprawidłowy status.');data.status=status;}
    const saved=await prisma.absence.update({where:{id:params.id},data,include:{user:{select:{id:true,name:true,email:true}}}});
    return Response.json(saved);
  }catch(error){return Response.json({error:error.message||'Nie udało się zaktualizować zgłoszenia.'},{status:400});}
}

export async function DELETE(req,{params}){
  const user=currentUser();
  if(!user)return Response.json({error:'Unauthorized'},{status:401});
  const current=await prisma.absence.findUnique({where:{id:params.id}});
  if(!current)return Response.json({error:'Nie znaleziono zgłoszenia.'},{status:404});
  if(user.role!=='ADMIN'&&(current.userId!==user.id||current.status!=='PENDING'))return Response.json({error:'Brak uprawnień.'},{status:403});
  await prisma.absence.delete({where:{id:params.id}});
  return Response.json({ok:true});
}
