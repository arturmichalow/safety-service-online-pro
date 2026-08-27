import OpenAI from 'openai';
import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';
import { costForMinutes, resolveHourlyCost } from '../../../../lib/calculations';

export async function GET(){
 const user=currentUser();
 if(!user||user.role!=='ADMIN')return Response.json({error:'Forbidden'},{status:403});
 const companies=await prisma.company.findMany({include:{workEntries:{include:{user:{select:{id:true,name:true,hourlyCost:true}}}},extraOrders:{include:{user:{select:{id:true,name:true,hourlyCost:true}}}},assignedUser:true}});
 const summary=companies.map(c=>{
  const workMinutes=c.workEntries.reduce((s,e)=>s+Number(e.minutes||0)+Number(e.travelMinutes||0),0);
  const orderMinutes=c.extraOrders.reduce((s,o)=>s+Number(o.minutes||0)+Number(o.travelMinutes||0),0);
  const minutes=workMinutes+orderMinutes;
  const travel=c.workEntries.reduce((s,e)=>s+Number(e.travelMinutes||0),0)+c.extraOrders.reduce((s,o)=>s+Number(o.travelMinutes||0),0);
  const extraWorkCosts=c.workEntries.reduce((s,e)=>s+Number(e.additionalCost||0),0);
  const ordersNet=c.extraOrders.reduce((s,o)=>s+Number(o.netAmount||0),0);
  const orderCosts=c.extraOrders.reduce((s,o)=>s+Number(o.travelCost||0)+Number(o.extraCost||0),0);
  const net=Number(c.netAmount||0)+ordersNet;
  const costs=Number(c.travelCost||0)+Number(c.extraCost||0)+extraWorkCosts+orderCosts;
  const timeCost=c.workEntries.reduce((s,e)=>s+costForMinutes(Number(e.minutes||0)+Number(e.travelMinutes||0),resolveHourlyCost(e.user,150)),0)+c.extraOrders.reduce((s,o)=>s+costForMinutes(Number(o.minutes||0)+Number(o.travelMinutes||0),resolveHourlyCost(o.user,250)),0);
  const profit=net-costs-timeCost;
  return{name:c.name,employee:c.assignedUser?.name,monthlyAmount:Number(c.netAmount||0),extraOrdersNet:ordersNet,totalNet:net,minutes,travelMinutes:travel,costs,timeCost,profit,hourlyRate:minutes?profit/(minutes/60):0};
 }).sort((a,b)=>a.profit-b.profit);
 if(!process.env.OPENAI_API_KEY){const worst=summary.slice(0,5);return Response.json({analysis:worst.length?`AI lokalne: Najsłabiej wypadają: ${worst.map(x=>`${x.name} (zysk ${x.profit.toFixed(2)} zł, ${x.hourlyRate.toFixed(2)} zł/h)`).join(', ')}. Podpowiedź: sprawdź zlecenia dodatkowe, koszty dojazdów, koszty dodatkowe i czas pracy.`:'Brak danych.'})}
 const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
 const response=await client.chat.completions.create({model:'gpt-4o-mini',messages:[{role:'system',content:'Jesteś analitykiem rentowności usług BHP. Odpowiadasz po polsku, konkretnie.'},{role:'user',content:'Przeanalizuj rentowność. Koszt czasu jest już policzony według indywidualnych stawek pracowników: '+JSON.stringify(summary)}]});
 return Response.json({analysis:response.choices[0].message.content});
}
