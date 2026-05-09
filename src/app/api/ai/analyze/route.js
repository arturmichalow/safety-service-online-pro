import OpenAI from 'openai';
import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';
export async function GET(){
 const user=currentUser(); if(!user||user.role!=='ADMIN')return Response.json({error:'Forbidden'},{status:403});
 const companies=await prisma.company.findMany({include:{workEntries:true,assignedUser:true}});
 const summary=companies.map(c=>{const minutes=c.workEntries.reduce((s,e)=>s+e.minutes,0);const travel=c.workEntries.reduce((s,e)=>s+(e.travelMinutes||0),0);const net=Number(c.netAmount||0),costs=Number(c.travelCost||0)+Number(c.extraCost||0);return{name:c.name,employee:c.assignedUser?.name,netAmount:net,minutes,travelMinutes:travel,costs,hourlyRate:minutes?(net-costs)/(minutes/60):0}}).sort((a,b)=>a.hourlyRate-b.hourlyRate);
 if(!process.env.OPENAI_API_KEY){const worst=summary.filter(x=>x.minutes>0).slice(0,5);return Response.json({analysis:worst.length?`AI lokalne: Najsłabiej wypadają: ${worst.map(x=>`${x.name} (${x.hourlyRate.toFixed(2)} zł/h)`).join(', ')}. Podpowiedź: renegocjuj kwoty netto, ogranicz dojazdy, wprowadź limit godzin miesięcznych albo przenieś część obsługi na zdalną.`:'Brak danych czasowych. Dodaj wpisy pracy, żeby policzyć rentowność.'})}
 const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
 const response=await client.chat.completions.create({model:'gpt-4o-mini',messages:[{role:'system',content:'Jesteś analitykiem rentowności usług BHP. Odpowiadasz po polsku, konkretnie.'},{role:'user',content:'Przeanalizuj rentowność i daj rekomendacje: '+JSON.stringify(summary)}]});
 return Response.json({analysis:response.choices[0].message.content});
}
