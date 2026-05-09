import ExcelJS from 'exceljs';
import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

function norm(v){return String(v||'').trim()}
function num(v){const n=Number(String(v||'0').replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0}

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
  ws.getRow(1).eachCell((cell,i)=>headers[i]=norm(cell.value).toLowerCase());
  function val(row,names){const idx=headers.findIndex(h=>names.some(n=>h.includes(n)));return idx>=0?row.getCell(idx).value:null}
  for(let r=2;r<=ws.rowCount;r++){
    const row=ws.getRow(r);
    const name=norm(val(row,['nazwa','firma']));
    if(!name) continue;
    const payload={
      name,
      nip:norm(val(row,['nip']))||null,
      netAmount:num(val(row,['kwota','netto'])),
      serviceType:norm(val(row,['typ','uwagi']))||null,
      status:'ACTIVE',
      billingType:'MONTHLY'
    };
    const existing=await prisma.company.findFirst({where:{name}});
    if(existing){await prisma.company.update({where:{id:existing.id},data:payload});updated++;}
    else{await prisma.company.create({data:payload});created++;}
  }
  await prisma.auditLog.create({data:{userId:user.id,action:'IMPORT_EXCEL',entity:'Company',after:{created,updated}}});
  return new Response(`<html><body style="font-family:Calibri;padding:30px"><h1>Import zakończony</h1><p>Dodano: ${created}, zaktualizowano: ${updated}</p><a href="/">Wróć do aplikacji</a></body></html>`,{headers:{'Content-Type':'text/html;charset=utf-8'}});
}
