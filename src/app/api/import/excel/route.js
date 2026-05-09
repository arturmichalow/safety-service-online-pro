import ExcelJS from 'exceljs';
import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

function norm(v){ return String(v ?? '').trim(); }
function num(v){
  const cleaned = String(v ?? '0').replace(/\s/g,'').replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function key(s){ return norm(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
async function employeeByName(raw){
  const value = key(raw);
  if(!value) return null;
  const target = value === 'biuro' ? 'arkadiusz zrebiec' : value;
  const users = await prisma.user.findMany({select:{id:true,name:true,email:true}});
  return users.find(u => key(u.name).includes(target) || target.includes(key(u.name)) || key(u.email).includes(target)) || null;
}

export async function POST(req){
  const user=currentUser();
  if(!user||user.role!=='ADMIN') return Response.json({error:'Forbidden'},{status:403});
  const fd=await req.formData();
  const file=fd.get('file');
  if(!file) return Response.json({error:'Brak pliku Excel.'},{status:400});
  const buf=Buffer.from(await file.arrayBuffer());
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws=wb.worksheets[0];
  let created=0, updated=0;
  const headers=[];
  ws.getRow(1).eachCell((cell,i)=>headers[i]=key(cell.value));
  function val(row,names){
    const idx=headers.findIndex(h=>names.some(n=>h.includes(key(n))));
    return idx>=0 ? row.getCell(idx).value : null;
  }
  for(let r=2;r<=ws.rowCount;r++){
    const row=ws.getRow(r);
    const name=norm(val(row,['Nazwa firmy','firma','nazwa']));
    if(!name) continue;
    const employeeRaw = norm(val(row,['Pracownik','BIURO','osoba']));
    const employee = await employeeByName(employeeRaw);
    const payload={
      name,
      nip:norm(val(row,['NIP']))||null,
      netAmount:num(val(row,['Kwota','Kwota netto'])),
      serviceType:'BHP',
      extraCostDescription:norm(val(row,['Uwagi']))||null,
      status:'ACTIVE',
      billingType:'MONTHLY',
      assignedUserId:employee?.id||null
    };
    const existing=await prisma.company.findFirst({where:{name}});
    if(existing){ await prisma.company.update({where:{id:existing.id},data:payload}); updated++; }
    else{ await prisma.company.create({data:payload}); created++; }
  }
  await prisma.auditLog.create({data:{userId:user.id,action:'IMPORT_EXCEL',entity:'Company',after:{created,updated}}});
  return new Response(`<html><body style="font-family:Calibri;padding:30px"><h1>Import zakończony</h1><p>Dodano: ${created}, zaktualizowano: ${updated}</p><a href="/">Wróć do aplikacji</a></body></html>`,{headers:{'Content-Type':'text/html;charset=utf-8'}});
}
