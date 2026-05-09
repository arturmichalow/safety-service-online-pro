import ExcelJS from 'exceljs';
import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';
function minToText(m){const h=Math.floor((m||0)/60),mm=(m||0)%60;return `${h}h ${mm}m`}
export async function GET(){
 const user=currentUser(); if(!user||user.role!=='ADMIN')return Response.json({error:'Forbidden'},{status:403});
 const companies=await prisma.company.findMany({include:{workEntries:true,assignedUser:true},orderBy:{name:'asc'}});
 const entries=await prisma.workEntry.findMany({include:{company:true,user:true},orderBy:{date:'desc'}});
 const wb=new ExcelJS.Workbook(); wb.creator='Safety Service';
 const s=wb.addWorksheet('Podsumowanie');
 s.columns=[{header:'Firma',key:'name',width:30},{header:'Pracownik',key:'employee',width:24},{header:'Godziny',key:'hours',width:16},{header:'Dojazdy',key:'travel',width:16},{header:'Kwota netto',key:'amount',width:16},{header:'Koszty',key:'costs',width:16},{header:'Stawka/h',key:'rate',width:16},{header:'Rentowność',key:'rent',width:16}];
 companies.forEach(c=>{const minutes=c.workEntries.reduce((sum,e)=>sum+e.minutes,0);const travel=c.workEntries.reduce((sum,e)=>sum+(e.travelMinutes||0),0);const amount=Number(c.netAmount||0),costs=Number(c.travelCost||0)+Number(c.extraCost||0)+c.workEntries.reduce((sum,e)=>sum+Number(e.additionalCost||0),0);const rate=minutes?(amount-costs)/(minutes/60):0;const rent=rate>=250?'Wysoka':rate>=150?'Średnia':minutes?'Niska':'Brak';s.addRow({name:c.name,employee:c.assignedUser?.name||'',hours:minToText(minutes),travel:minToText(travel),amount,costs,rate:+rate.toFixed(2),rent})});
 for(const ws of [s]){ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF132734'}};ws.autoFilter='A1:H1'}
 const h=wb.addWorksheet('Historia pracy');
 h.columns=[{header:'Data',key:'date',width:16},{header:'Firma',key:'company',width:30},{header:'Użytkownik',key:'user',width:22},{header:'Czynność',key:'title',width:24},{header:'Opis',key:'description',width:50},{header:'Czas pracy',key:'time',width:14},{header:'Dojazd',key:'travel',width:14},{header:'Koszt dodatkowy',key:'additionalCost',width:18},{header:'Opis kosztu',key:'additionalCostDescription',width:30}];
 entries.forEach(e=>h.addRow({date:e.date.toISOString().slice(0,10),company:e.company.name,user:e.user.name,title:e.title,description:e.description,time:minToText(e.minutes),travel:minToText(e.travelMinutes||0),additionalCost:Number(e.additionalCost||0),additionalCostDescription:e.additionalCostDescription||''}));
 h.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};h.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFF5A14'}};h.autoFilter='A1:I1';
 const st=wb.addWorksheet('Statystyki');st.addRows([['Statystyka','Wartość'],['Liczba firm',companies.length],['Liczba wpisów',entries.length],['Suma godzin',entries.reduce((x,e)=>x+e.minutes,0)/60],['Suma dojazdów',entries.reduce((x,e)=>x+(e.travelMinutes||0),0)/60],['Suma kosztów dodatkowych',entries.reduce((x,e)=>x+Number(e.additionalCost||0),0)]]);st.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};st.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF132734'}};
 const buffer=await wb.xlsx.writeBuffer();return new Response(buffer,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="raport_safety_service.xlsx"'}})
}
