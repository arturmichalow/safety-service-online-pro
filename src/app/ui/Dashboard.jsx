'use client';
import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import jsPDF from 'jspdf';

const modules=[['dashboard','Podsumowanie'],['clients','Klienci'],['employees','Baza pracowników'],['workerStats','Pracownicy'],['work','Panel pracownika'],['extraOrders','Zlecenia dodatkowe'],['shopOrders','Zlecenia Sklep'],['initialTrainings','Szkolenia wstępne'],['ai','AI analiza rentowności'],['charts','Wykres czasu pracy'],['profitCharts','Wykres rentowności'],['import','Import danych'],['export','Eksporty'],['security','Bezpieczeństwo i konto'],['users','Użytkownicy i role'],['account','Moje konto'],['pwa','PWA / telefon']];
const workTypes=['dokumentacja','audyt','szkolenie','dojazd','email','telefon','inne'];
const orderTypes=['szkolenie','audyt','ratownik','pomiary oświetlenia','dokumentacja','konsultacje','wypadek','inne'];
function minToText(m){const h=Math.floor((m||0)/60),mm=(m||0)%60;return `${h}h ${mm}m`}
function minutesToInput(minutes){
 const total=Number(minutes||0);
 const h=Math.floor(total/60);
 const m=total%60;

 return `${h}:${String(m).padStart(2,'0')}`;
}
function money(v){return `${Number(v||0).toLocaleString('pl-PL')} zł`}
function parseTime(s){s=String(s||'').toLowerCase().replace(',','.').trim();if(!s)return 0;if(s.includes(':')){const [h,m]=s.split(':');return Number(h)*60+Number(m||0)}const h=s.match(/(\d+(\.\d+)?)\s*h/),m=s.match(/(\d+)\s*m/);if(h||m)return Math.round(Number(h?.[1]||0)*60+Number(m?.[1]||0));return Math.round(Number(s||0)*60)}
function getShopMargin(o){const m=String(o.description||'').match(/\[MARZA_SKLEP:([^\]]+)\]/);return m?Number(String(m[1]).replace(',','.').replace(/[^0-9.-]/g,'')):Number(o.netAmount||0)}
function cleanShopDescription(o){return String(o.description||'').replace(/\s*\[MARZA_SKLEP:[^\]]+\]\s*/,'').trim()}
function has(user,key){return user.role==='ADMIN'||user.permissions?.[key]}
async function jsonFetch(url,opts){const r=await fetch(url,opts);let j={};try{j=await r.json()}catch{}if(!r.ok)throw new Error(j.error||'Błąd zapisu');return j}
async function nipLookup(nip){const clean=String(nip||'').replace(/\D/g,'');if(clean.length!==10)return null;const r=await fetch('/api/nip/'+clean,{cache:'no-store'});const j=await r.json();return r.ok&&j?.name?j:null}
async function autofillByNip(formEl){try{const nip=formEl?.elements?.nip?.value;if(!nip)return;const d=await nipLookup(nip);if(!d)return;const hasEmpty=['name','address','contactPerson','phone','email'].some(k=>formEl.elements[k]&&!formEl.elements[k].value);if(!hasEmpty)return;if(formEl.elements.name&&!formEl.elements.name.value)formEl.elements.name.value=d.name||'';if(formEl.elements.address&&!formEl.elements.address.value)formEl.elements.address.value=d.address||'';if(formEl.elements.nip&&!formEl.elements.nip.value)formEl.elements.nip.value=d.nip||'';}catch(e){console.warn(e)}}

export default function Dashboard({user}){
 const [companySearch,setCompanySearch]=useState('');
 const [companySort,setCompanySort]=useState('name_asc');
 const [companyStatus,setCompanyStatus]=useState('ALL');
 const [selectedMonth,setSelectedMonth]=useState(new Date().toISOString().slice(0,7));

function inSelectedMonth(date){
  return String(date || '').slice(0,7) === selectedMonth;
}
 const [tab,setTab]=useState(user.role==='WORKER'?'work':'dashboard');
 const [data,setData]=useState({companies:[],workEntries:[],extraOrders:[],users:[]});
 const [summarySort,setSummarySort]=useState({
  key:'profit',
  direction:'desc'
});
 const [selectedCompany,setSelectedCompany]=useState(null);
 const [editUser,setEditUser]=useState(null);
 const [ai,setAi]=useState('');
 const [form,setForm]=useState({date:new Date().toISOString().slice(0,10),companyId:'',newCompanyName:'',type:'dokumentacja',title:'',description:'',time:'',travelTime:'',additionalCost:'',additionalCostDescription:'',orderNumber:'',netAmount:''});
 const [order,setOrder]=useState({date:new Date().toISOString().slice(0,10),companyId:'',newCompanyName:'',title:'',type:'inne',description:'',netAmount:'',travelCost:'',extraCost:'',extraCostDescription:'',time:'',orderNumber:'',status:'OPEN'});
 const [shopOrder,setShopOrder]=useState({date:new Date().toISOString().slice(0,10),companyId:'',newCompanyName:'',title:'',description:'',netAmount:'',margin:'',travelCost:'',extraCost:'',extraCostDescription:'',time:'',status:'OPEN'});
 const [training,setTraining]=useState({date:new Date().toISOString().slice(0,10),companyId:'',newCompanyName:'',time:'1:00',unitAmount:'109',peopleCount:'1',netAmount:'109',extraCostDescription:'',description:'',status:'DONE'});
 const [editingWorkEntry,setEditingWorkEntry]=useState(null);
 const [quickNotesOpen,setQuickNotesOpen]=useState(false);
 const [quickNotes,setQuickNotes]=useState([]);
 const [quickNoteContent,setQuickNoteContent]=useState('');
 const [quickNoteCompanyId,setQuickNoteCompanyId]=useState('');
 const [quickNotesLoading,setQuickNotesLoading]=useState(false);
 const myDayEntries=useMemo(()=>{
  return (data.workEntries||[])
   .filter(entry=>{
    const entryDate=String(entry.date||'').slice(0,10);

    return entry.userId===user.id && entryDate===form.date;
   })
   .sort((a,b)=>new Date(b.createdAt||b.date)-new Date(a.createdAt||a.date));
 },[data.workEntries,user.id,form.date]);

 const myDayTotalMinutes=useMemo(()=>{
  return myDayEntries.reduce((sum,entry)=>{
   return sum+Number(entry.minutes||0);
  },0);
 },[myDayEntries]);

 function workEntryCompanyName(entry){
  return data.companies.find(company=>company.id===entry.companyId)?.name||'Nieznana firma';
 }
 async function load(){const r=await fetch('/api/data',{cache:'no-store'});const j=await r.json();setData({...j,extraOrders:j.extraOrders||[]});setSelectedCompany(prev=>prev?j.companies.find(c=>c.id===prev.id)||prev:j.companies?.[0]||null)}
 async function loadQuickNotes(){
 try{
  setQuickNotesLoading(true);

  const notes=await jsonFetch('/api/quick-notes',{
   cache:'no-store'
  });

  setQuickNotes(Array.isArray(notes)?notes:[]);
 }catch(err){
  console.error('Błąd pobierania notatek:',err);
 }finally{
  setQuickNotesLoading(false);
 }
}
 useEffect(()=>{
 load();
 loadQuickNotes();
},[]);
 const stats=useMemo(()=>{const rows=data.companies.map(c=>{
  const entries=data.workEntries.filter(w=>w.companyId===c.id && inSelectedMonth(w.date));
const orders=data.extraOrders.filter(o=>o.companyId===c.id && inSelectedMonth(o.date));
  const trainings=orders.filter(o=>String(o.type||'').toLowerCase()==='szkolenie wstępne');
  const normalOrders=orders.filter(o=>String(o.type||'').toLowerCase()!=='szkolenie wstępne');
  const shopOrders=normalOrders.filter(o=>String(o.type||'').toLowerCase()==='zlecenie sklep');
  const regularOrders=normalOrders.filter(o=>String(o.type||'').toLowerCase()!=='zlecenie sklep');
  const workMinutes=entries.reduce((s,e)=>s+Number(e.minutes||0),0);
  const normalOrderMinutes=normalOrders.reduce((s,o)=>s+Number(o.minutes||0),0);
  const trainingMinutes=trainings.reduce((s,o)=>s+Number(o.minutes||0),0);
  const minutes=workMinutes+normalOrderMinutes+trainingMinutes;
  const netMonthly=Number(c.netAmount||0);
  const hasMonthlyService=netMonthly>0 || String(c.billingType||'').toUpperCase()==='MONTHLY';
  const netOrders=regularOrders.reduce((s,o)=>s+Number(o.netAmount||0),0)+shopOrders.reduce((s,o)=>s+getShopMargin(o),0);
  const trainingAmount=trainings.reduce((s,o)=>s+Number(o.netAmount||0),0);
  // Szkolenia wstępne:
  // - firma w obsłudze miesięcznej: szkolenie NIE jest dodatkowym przychodem, obniża zysk tylko przez czas specjalisty 150 zł/h,
  // - firma jednorazowa / spoza obsługi: szkolenie jest przychodem = liczba osób x cena za osobę.
  const trainingIncome=hasMonthlyService?0:trainingAmount;
  const net=netMonthly+netOrders+trainingIncome;
  const entryCosts=entries.reduce((s,e)=>s+Number(e.additionalCost||0),0);
  const orderCosts=normalOrders.reduce((s,o)=>s+Number(o.travelCost||0)+Number(o.extraCost||0),0);
  const costs=Number(c.travelCost||0)+Number(c.extraCost||0)+entryCosts+orderCosts;
  const monthlyTimeCost=(workMinutes/60)*150;
  const extraOrdersTimeCost=(normalOrderMinutes/60)*250;
  const trainingTimeCost=(trainingMinutes/60)*(hasMonthlyService?150:0);
  const timeCost=monthlyTimeCost+extraOrdersTimeCost+trainingTimeCost;
  const profit=net-costs-timeCost;
  const rate=minutes?profit/(minutes/60):0;
  const rent=profit>0?(rate>=250?'Wysoka':'Średnia'):minutes||costs||net?'Niska':'Brak';
  return {...c,entries,orders,trainings,normalOrders,shopOrders,regularOrders,minutes,netMonthly,netOrders,trainingIncome,trainingAmount,netTotal:net,costs,timeCost,profit,hours:+(minutes/60).toFixed(2),rate:+rate.toFixed(2),rent}
});

const groupedMap = new Map();

rows.forEach(r => {
  const key = String(r.name || '').trim().toLowerCase();

  if (!groupedMap.has(key)) {
    groupedMap.set(key, {...r});
    return;
  }

  const g = groupedMap.get(key);

  g.minutes += r.minutes || 0;
  g.netMonthly += r.netMonthly || 0;
  g.netOrders += r.netOrders || 0;
  g.trainingIncome += r.trainingIncome || 0;
  g.trainingAmount += r.trainingAmount || 0;
  g.netTotal += r.netTotal || 0;
  g.costs += r.costs || 0;
  g.timeCost += r.timeCost || 0;
  g.profit += r.profit || 0;
  g.hours = +(g.minutes / 60).toFixed(2);
  g.rate = g.minutes ? +(g.profit / (g.minutes / 60)).toFixed(2) : 0;
  g.rent = g.profit > 0 ? (g.rate >= 250 ? 'Wysoka' : 'Średnia') : (g.minutes || g.costs || g.netTotal ? 'Niska' : 'Brak');
});

const groupedRows = [...groupedMap.values()];

return {
  rows: groupedRows,
  totalMin: groupedRows.reduce((s,r)=>s+r.minutes,0),
  totalIncome: groupedRows.reduce((s,r)=>s+r.netTotal,0),
  best: groupedRows.filter(r=>r.minutes||r.netTotal).sort((a,b)=>b.profit-a.profit)[0],
  time: [...groupedRows].sort((a,b)=>b.minutes-a.minutes)[0]
}},[data,selectedMonth]);
  const filteredCompanies=useMemo(()=>{return [...(data.companies||[])]
 .filter(c=>(c?.name||'').toLowerCase().includes(companySearch.toLowerCase()))
 .filter(c=>companyStatus==='ALL'||c.status===companyStatus)
 .sort((a,b)=>{
  const an=Number(a.netAmount||0),bn=Number(b.netAmount||0);
  if(companySort==='money_desc')return bn-an;
  if(companySort==='money_asc')return an-bn;
  if(companySort==='name_desc')return (b.name||'').localeCompare(a.name||'','pl');
  return (a.name||'').localeCompare(b.name||'','pl');
 })
 },[data.companies,companySearch,companySort,companyStatus]);
 async function saveCompany(e){e.preventDefault();const formEl=e.currentTarget;try{const body=Object.fromEntries(new FormData(formEl).entries());const saved=await jsonFetch('/api/companies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});setSelectedCompany(saved);formEl.reset();await load();alert('Firma dodana.')}catch(err){alert(err.message)}}
 async function updateCompany(e){e.preventDefault();const formEl=e.currentTarget;try{const body=Object.fromEntries(new FormData(formEl).entries());const saved=await jsonFetch('/api/companies/'+selectedCompany.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});setSelectedCompany(saved);await load();alert('Dane firmy zapisane.')}catch(err){alert(err.message)}}
 async function deleteCompany(c){if(!c)return;if(!confirm(`Czy na pewno usunąć tę firmę: ${c.name}?`))return;try{await jsonFetch('/api/companies/'+c.id,{method:'DELETE'});setSelectedCompany(null);await load();alert('Firma usunięta.')}catch(err){alert(err.message)}}
 async function addWork(){try{
  let companyId=form.companyId;
  const newCompanyName=String(form.newCompanyName||'').trim();
  const minutes=parseTime(form.time);

  // Jeśli pracownik wpisuje firmę spoza listy, traktujemy to jako zlecenie dodatkowe.
  // Dzięki temu można wpisać kwotę za zlecenie i firma pojawi się w podsumowaniu.
  if(!companyId&&newCompanyName){
    if(!form.time)return alert('Wpisz czas pracy.');
    if(!form.netAmount)return alert('Wpisz kwotę za zlecenie dla nowej firmy.');
    const created=await jsonFetch('/api/companies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newCompanyName,status:'ACTIVE',billingType:'ONE_TIME',netAmount:0,travelCost:0,extraCost:0})});
    companyId=created.id;
    await jsonFetch('/api/extra-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      companyId,
      date:form.date,
      title:form.description?.trim()||form.type||'Zlecenie z panelu pracownika',
      type:form.type||'inne',
      description:form.description||'',
      netAmount:Number(form.netAmount||0),
      travelCost:0,
      extraCost:Number(form.additionalCost||0),
      extraCostDescription:form.additionalCostDescription||null,
      minutes,
      orderNumber:form.orderNumber||null,
      status:'DONE'
    })});
    setForm({...form,companyId:'',newCompanyName:'',description:'',time:'',travelTime:'',additionalCost:'',additionalCostDescription:'',orderNumber:'',netAmount:''});
    await load();
    alert('Dodano zlecenie dla nowej firmy i ujęto je w podsumowaniu.');
    return;
  }

  if(!companyId||!form.time)return alert('Wybierz firmę albo wpisz nową firmę oraz czas.');
  await jsonFetch('/api/work',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,companyId,title:form.description?.trim()||form.type,minutes,travelMinutes:parseTime(form.travelTime),additionalCost:Number(form.additionalCost||0),additionalCostDescription:form.additionalCostDescription})});
  setForm({...form,companyId:'',newCompanyName:'',description:'',time:'',travelTime:'',additionalCost:'',additionalCostDescription:'',orderNumber:'',netAmount:''});
  await load();alert('Dodano wpis pracy.');
 }catch(err){alert(err.message)}}
 function startEditWorkEntry(entry){
 setEditingWorkEntry(entry);

 setForm({
  date:String(entry.date||'').slice(0,10),
  companyId:entry.companyId||'',
  newCompanyName:'',
  type:entry.type||'inne',
  title:entry.title||'',
  description:entry.description||'',
  time:minutesToInput(entry.minutes),
  travelTime:minutesToInput(entry.travelMinutes),
  additionalCost:String(entry.additionalCost||''),
  additionalCostDescription:entry.additionalCostDescription||'',
  orderNumber:entry.orderNumber||'',
  netAmount:''
 });

 window.scrollTo({
  top:0,
  behavior:'smooth'
 });
}

function cancelEditWorkEntry(){
 setEditingWorkEntry(null);

 setForm({
  date:new Date().toISOString().slice(0,10),
  companyId:'',
  newCompanyName:'',
  type:'dokumentacja',
  title:'',
  description:'',
  time:'',
  travelTime:'',
  additionalCost:'',
  additionalCostDescription:'',
  orderNumber:'',
  netAmount:''
 });
}

async function saveEditedWorkEntry(){
 if(!editingWorkEntry)return;

 try{
  if(!form.companyId){
   return alert('Wybierz firmę.');
  }

  if(!form.time){
   return alert('Wpisz czas pracy.');
  }

  await jsonFetch('/api/work/'+editingWorkEntry.id,{
   method:'PUT',
   headers:{
    'Content-Type':'application/json'
   },
   body:JSON.stringify({
    date:form.date,
    companyId:form.companyId,
    orderNumber:form.orderNumber||null,
    type:form.type||'inne',
    title:form.description?.trim()||form.type||'Wpis pracy',
    description:form.description||null,
    minutes:parseTime(form.time),
    travelMinutes:parseTime(form.travelTime),
    additionalCost:Number(form.additionalCost||0),
    additionalCostDescription:form.additionalCostDescription||null
   })
  });

  setEditingWorkEntry(null);

  setForm({
   date:form.date,
   companyId:'',
   newCompanyName:'',
   type:'dokumentacja',
   title:'',
   description:'',
   time:'',
   travelTime:'',
   additionalCost:'',
   additionalCostDescription:'',
   orderNumber:'',
   netAmount:''
  });

  await load();

  alert('Wpis został zaktualizowany.');
 }catch(err){
  alert(err.message);
 }
}

async function deleteWorkEntry(entry){
 if(!entry)return;

 const companyName=workEntryCompanyName(entry);

 if(!confirm(`Czy na pewno usunąć wpis dla firmy: ${companyName}?`)){
  return;
 }

 try{
  await jsonFetch('/api/work/'+entry.id,{
   method:'DELETE'
  });

  if(editingWorkEntry?.id===entry.id){
   cancelEditWorkEntry();
  }

  await load();

  alert('Wpis został usunięty.');
 }catch(err){
  alert(err.message);
 }
}
 async function addQuickNote(){
 const content=String(quickNoteContent||'').trim();

 if(!content){
  return alert('Wpisz treść notatki.');
 }

 try{
  await jsonFetch('/api/quick-notes',{
   method:'POST',
   headers:{
    'Content-Type':'application/json'
   },
   body:JSON.stringify({
    content,
    companyId:quickNoteCompanyId||form.companyId||null
   })
  });

  setQuickNoteContent('');
  setQuickNoteCompanyId('');

  await loadQuickNotes();
 }catch(err){
  alert(err.message);
 }
}
 async function addExtraOrder(e){
 e.preventDefault();
 try{
  let companyId=order.companyId;
  const newCompanyName=String(order.newCompanyName||'').trim();
  if(!companyId&&newCompanyName){
   const created=await jsonFetch('/api/companies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newCompanyName,status:'ACTIVE',billingType:'ONE_TIME',netAmount:0,travelCost:0,extraCost:0})});
   companyId=created.id;
  }
  if(!companyId||!order.title)return alert('Wybierz firmę albo wpisz nową firmę i wpisz nazwę zlecenia.');
  await jsonFetch('/api/extra-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...order,companyId,minutes:parseTime(order.time)})});
  setOrder({...order,companyId:'',newCompanyName:'',title:'',description:'',netAmount:'',travelCost:'',extraCost:'',extraCostDescription:'',time:'',orderNumber:''});
  await load();
  alert('Dodano zlecenie dodatkowe.');
 }catch(err){alert(err.message)}
}
 async function addInitialTraining(e){e.preventDefault();try{
  let companyId=training.companyId;
  if(!companyId){
    const name=String(training.newCompanyName||'').trim();
    if(!name)return alert('Wybierz firmę albo wpisz nazwę nowej firmy.');
    const created=await jsonFetch('/api/companies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,status:'ACTIVE',billingType:'MONTHLY',netAmount:0})});
    companyId=created.id;
  }
  const people=Number(training.peopleCount||1);
  const unit=Number(training.unitAmount||0);
  const total=people*unit;
  if(!companyId||!people||!unit)return alert('Uzupełnij firmę, ilość osób i kwotę netto za osobę.');
  await jsonFetch('/api/extra-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    companyId,
    date:training.date,
    title:'Szkolenie wstępne',
    type:'szkolenie wstępne',
    description:`Ilość osób: ${people}; kwota za osobę: ${unit} zł. ${training.description||''}`.trim(),
    netAmount:Number(training.netAmount||total),
    travelCost:0,
    extraCost:0,
    minutes:parseTime(training.time||'1:00'),
    extraCostDescription:training.extraCostDescription||null,
    orderNumber:null,
    status:training.status||'DONE'
  })});
  setTraining({date:new Date().toISOString().slice(0,10),companyId:'',newCompanyName:'',time:'1:00',unitAmount:'109',peopleCount:'1',netAmount:'109',extraCostDescription:'',description:'',status:'DONE'});
  await load();
  alert('Dodano szkolenie wstępne i doliczono je do przychodu firmy.');
}catch(err){alert(err.message)}}

 async function addShopOrder(e){
 e.preventDefault();
 try{
  let companyId=shopOrder.companyId;
  const newCompanyName=String(shopOrder.newCompanyName||'').trim();
  if(!companyId&&newCompanyName){
   const created=await jsonFetch('/api/companies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newCompanyName,status:'ACTIVE',billingType:'ONE_TIME',netAmount:0,travelCost:0,extraCost:0})});
   companyId=created.id;
  }
  if(!companyId||!shopOrder.title)return alert('Wybierz firmę albo wpisz nową firmę i wpisz nazwę zlecenia.');
  const marginValue=Number(shopOrder.margin||0);
  const description=[shopOrder.description||'',`[MARZA_SKLEP:${marginValue}]`].filter(Boolean).join('\n');
  await jsonFetch('/api/extra-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    companyId,
    date:shopOrder.date,
    title:shopOrder.title,
    type:'zlecenie sklep',
    description,
    netAmount:Number(shopOrder.netAmount||0),
    travelCost:Number(shopOrder.travelCost||0),
    extraCost:Number(shopOrder.extraCost||0),
    extraCostDescription:shopOrder.extraCostDescription||null,
    minutes:parseTime(shopOrder.time),
    orderNumber:null,
    status:shopOrder.status||'OPEN'
  })});
  setShopOrder({date:new Date().toISOString().slice(0,10),companyId:'',newCompanyName:'',title:'',description:'',netAmount:'',margin:'',travelCost:'',extraCost:'',extraCostDescription:'',time:'',status:'OPEN'});
  await load();
  alert('Dodano zlecenie sklep.');
 }catch(err){alert(err.message)}
}

 async function deleteExtraOrder(o){if(!confirm(`Czy na pewno usunąć zlecenie: ${o.title}?`))return;try{await jsonFetch('/api/extra-orders/'+o.id,{method:'DELETE'});await load();alert('Zlecenie usunięte.')}catch(err){alert(err.message)}}
 async function runAi(){setAi('Analizuję klientów...');const r=await fetch('/api/ai/analyze');const j=await r.json();setAi(j.analysis)}
 async function addUser(e){e.preventDefault();const formEl=e.currentTarget;try{const body=Object.fromEntries(new FormData(formEl).entries());body.permissions=Object.fromEntries(modules.map(([k])=>[k,!!body['perm_'+k]]));modules.forEach(([k])=>delete body['perm_'+k]);await jsonFetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});formEl.reset();await load();alert('Użytkownik dodany.')}catch(err){alert(err.message)}}
 async function saveUser(e){e.preventDefault();const formEl=e.currentTarget;try{const body=Object.fromEntries(new FormData(formEl).entries());body.permissions=Object.fromEntries(modules.map(([k])=>[k,!!body['perm_'+k]]));modules.forEach(([k])=>delete body['perm_'+k]);await jsonFetch('/api/users/'+editUser.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});setEditUser(null);await load();alert('Użytkownik zapisany.')}catch(err){alert(err.message)}}
 async function deleteUser(u){if(!confirm(`Czy na pewno usunąć pracownika: ${u.name}?`))return;try{await jsonFetch('/api/users/'+u.id,{method:'DELETE'});if(editUser?.id===u.id)setEditUser(null);await load();alert('Pracownik usunięty.')}catch(err){alert(err.message)}}
 return <div className="app"><aside className="sidebar"><div style={{textAlign:'right'}}>«</div><div className="side-title">Nawigacja</div><div className="userline">Użytkownik: <b>{user.name}</b></div><div className="userline">Rola: <b>{user.role==='ADMIN'?'Administrator':'Pracownik'}</b></div>{modules.map(([key,label])=>has(user,key)&&<button key={key} className={'navbtn '+(tab===key?'active':'')} onClick={()=>{setTab(key);setEditUser(null)}}>{label}</button>)}<a href="/logout" className="navbtn">Wyloguj</a></aside><main className="main"><header className="top"><img src="/logo_white.png" className="logo" alt="Safety Service"/><div className="title">SAFETY SERVICE — PANEL ROZLICZEŃ</div><a className="btn" href="/logout">Wyloguj</a></header><div className="content">
 {tab==='dashboard'&&
  <div className="panel">
    <div className="row between">
      <h1>Podsumowanie</h1>

      <label>
        Miesiąc:
        <input
          type="month"
          value={selectedMonth}
          onChange={e=>setSelectedMonth(e.target.value)}
          style={{marginLeft:8, maxWidth:180}}
        />
      </label>
    </div>

    <div className="kpis">
      <div className="card">Firmy<h2>{stats.rows.length}</h2></div>
      <div className="card">Godziny<h2>{minToText(stats.totalMin)}</h2></div>
      <div className="card">Przychód<h2>{money(stats.totalIncome)}</h2></div>
      <div className="card">Najbardziej rentowny<h2>{stats.best?.name||'-'}</h2></div>
    </div>

    <SummaryTable rows={stats.rows} selectedMonth={selectedMonth}/>
  </div>
}
 {tab==='clients'&&<div className="panel"><div className="grid"><form className="card" onSubmit={saveCompany}><h2>Dodaj firmę</h2><input name="name" placeholder="Nazwa firmy" required/><input name="nip" placeholder="NIP" onBlur={e=>autofillByNip(e.currentTarget.form)}/><input name="address" placeholder="Adres"/><input name="contactPerson" placeholder="Osoba kontaktowa"/><input name="phone" placeholder="Telefon"/><input name="email" placeholder="Email"/><input name="serviceType" placeholder="Typ obsługi"/><select name="assignedUserId"><option value="">Przypisz pracownika</option>{data.users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select><select name="status"><option value="ACTIVE">aktywna</option><option value="PAUSED">zawieszona</option><option value="INACTIVE">nieaktywna</option></select><select name="billingType"><option value="MONTHLY">miesięczne</option><option value="ONE_TIME">jednorazowe</option><option value="HOURLY">godzinowe</option></select><input name="netAmount" type="number" placeholder="Kwota netto miesięcznie"/><input name="travelCost" type="number" placeholder="Koszt dojazdów"/><input name="extraCost" type="number" placeholder="Dodatkowe koszty"/><input name="extraCostDescription" placeholder="Opis dodatkowych kosztów / uwagi"/><button className="orange">Zapisz</button></form><div className="card"><h2>Baza firm</h2><div className="filterBar"><input placeholder="Szukaj firmy..." value={companySearch} onChange={e=>setCompanySearch(e.target.value)}/><select value={companySort} onChange={e=>setCompanySort(e.target.value)}><option value="name_asc">Nazwa A-Z</option><option value="name_desc">Nazwa Z-A</option><option value="money_desc">Największa kwota</option><option value="money_asc">Najmniejsza kwota</option></select><select value={companyStatus} onChange={e=>setCompanyStatus(e.target.value)}><option value="ALL">Wszystkie statusy</option><option value="ACTIVE">Aktywne</option><option value="PAUSED">Zawieszone</option><option value="INACTIVE">Nieaktywne</option></select></div><div className="muted">Widoczne firmy: {filteredCompanies.length} / {data.companies.length}</div><div className="tableWrap"><table><thead><tr><th>Status</th><th>Firma</th><th>NIP</th><th>Pracownik</th><th>Kwota miesięczna</th><th>Uwagi</th><th>Akcje</th></tr></thead><tbody>{filteredCompanies.map(c=><tr className="clickable" key={c.id} onClick={()=>setSelectedCompany(c)}><td><span className={'status '+c.status}></span></td><td>{c.name}</td><td>{c.nip||'-'}</td><td>{c.assignedUser?.name||'-'}</td><td>{money(c.netAmount)}</td><td>{c.extraCostDescription||'-'}</td><td><button type="button" className="light iconBtn" onClick={(e)=>{e.stopPropagation();setSelectedCompany(c)}}>✏️</button><button type="button" className="light iconBtn" onClick={(e)=>{e.stopPropagation();deleteCompany(c)}}>🗑️</button></td></tr>)}</tbody></table></div>{selectedCompany&&<CompanyDetails key={selectedCompany.id} company={selectedCompany} users={data.users} orders={data.extraOrders.filter(o=>o.companyId===selectedCompany.id)} onSubmit={updateCompany} onDelete={()=>deleteCompany(selectedCompany)}/>}</div></div></div>}
 {tab==='employees'&&<div className="panel"><h1>Baza pracowników</h1><div className="employeeGrid">{data.users.map(u=><EmployeeCard key={u.id} u={u} onEdit={()=>{setTab('users');setEditUser(u)}} onDelete={()=>deleteUser(u)}/>)}</div></div>}
 {tab==='workerStats'&&<WorkerStatsPanel data={data}/>}
  {tab==='work'&&
  <div className="panel">

   <div className="card" style={{maxWidth:760}}>
    <h1>Panel pracownika</h1>
    {editingWorkEntry&&
 <div
  className="warnBox"
  style={{marginBottom:16}}
 >
  Edytujesz istniejący wpis. Po wprowadzeniu zmian kliknij „Zapisz zmiany”.
 </div>
}

    <input
     type="date"
     value={form.date}
     onChange={e=>setForm({...form,date:e.target.value})}
    />

    <select
     value={form.companyId}
     onChange={e=>setForm({
      ...form,
      companyId:e.target.value,
      newCompanyName:e.target.value?'':form.newCompanyName,
      netAmount:e.target.value?'':form.netAmount
     })}
    >
     <option value="">Wybierz firmę</option>

     {data.companies
      .filter(c=>c.status!=='INACTIVE')
      .map(c=>
       <option key={c.id} value={c.id}>
        {c.name}
       </option>
      )}
    </select>

    <input
     placeholder="Albo wpisz nową firmę, jeśli nie ma jej na liście"
     value={form.newCompanyName}
     onChange={e=>setForm({
      ...form,
      newCompanyName:e.target.value,
      companyId:e.target.value?'':form.companyId
     })}
    />

    <input
     placeholder="Numer zlecenia opcjonalnie"
     value={form.orderNumber}
     onChange={e=>setForm({...form,orderNumber:e.target.value})}
    />

    <select
     value={form.type}
     onChange={e=>setForm({...form,type:e.target.value})}
    >
     {workTypes.map(t=>
      <option key={t}>{t}</option>
     )}
    </select>

    <textarea
     placeholder="Opis wykonanych prac"
     value={form.description}
     onChange={e=>setForm({...form,description:e.target.value})}
    />

    {!form.companyId&&form.newCompanyName&&
     <input
      type="number"
      placeholder="Kwota za zlecenie — tylko dla firmy spoza listy"
      value={form.netAmount||''}
      onChange={e=>setForm({...form,netAmount:e.target.value})}
     />
    }

    <input
     placeholder="Czas pracy np. 2:30, 2h 30m, 150m"
     value={form.time}
     onChange={e=>setForm({...form,time:e.target.value})}
    />

    <input
     placeholder="Czas dojazdu np. 30m"
     value={form.travelTime}
     onChange={e=>setForm({...form,travelTime:e.target.value})}
    />

    <input
     placeholder="Dodatkowy koszt np. 300"
     value={form.additionalCost}
     onChange={e=>setForm({...form,additionalCost:e.target.value})}
    />

    <input
     placeholder="Opis kosztu np. ratownik medyczny"
     value={form.additionalCostDescription}
     onChange={e=>setForm({
      ...form,
      additionalCostDescription:e.target.value
     })}
    />

    {!editingWorkEntry&&
 <button
  type="button"
  className="orange"
  onClick={addWork}
 >
  Dodaj wpis
 </button>
}

{editingWorkEntry&&
 <div className="row" style={{marginTop:12}}>
  <button
   type="button"
   className="orange"
   onClick={saveEditedWorkEntry}
  >
   Zapisz zmiany
  </button>

  <button
   type="button"
   className="light"
   onClick={cancelEditWorkEntry}
  >
   Anuluj edycję
  </button>
 </div>
}
   </div>

   <div className="card" style={{maxWidth:1000,marginTop:20}}>
    <div className="row between">
     <div>
      <h2 style={{marginBottom:4}}>Moje wpisy z wybranego dnia</h2>

      <div className="muted">
       Data: {form.date}
      </div>
     </div>

     <div style={{textAlign:'right'}}>
      <b>Łączny czas</b>

      <h2 style={{margin:0}}>
       {minToText(myDayTotalMinutes)}
      </h2>
     </div>
    </div>

    {myDayEntries.length===0&&
     <p className="muted" style={{marginTop:20}}>
      Nie masz jeszcze żadnych wpisów z tego dnia.
     </p>
    }

    {myDayEntries.length>0&&
     <div className="tableWrap" style={{marginTop:20}}>
      <table>
       <thead>
        <tr>
         <th>Firma</th>
         <th>Rodzaj pracy</th>
         <th>Opis</th>
         <th>Czas pracy</th>
         <th>Dojazd</th>
         <th>Numer zlecenia</th>
         <th>Akcje</th>
        </tr>
       </thead>

       <tbody>
 {myDayEntries.map(entry=>
  <tr key={entry.id}>
   <td>{workEntryCompanyName(entry)}</td>

   <td>{entry.type||'-'}</td>

   <td
    style={{
     maxWidth:420,
     whiteSpace:'normal',
     wordBreak:'break-word'
    }}
   >
    {entry.description||entry.title||'-'}
   </td>

   <td>{minToText(Number(entry.minutes||0))}</td>

   <td>{minToText(Number(entry.travelMinutes||0))}</td>

   <td>{entry.orderNumber||'-'}</td>

   <td>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
     <button
      type="button"
      className="light"
      onClick={()=>startEditWorkEntry(entry)}
     >
      Edytuj
     </button>

     <button
      type="button"
      className="red"
      onClick={()=>deleteWorkEntry(entry)}
     >
      Usuń
     </button>
    </div>
   </td>
  </tr>
 )}
</tbody>
      </table>
     </div>
    }
   </div>

  </div>
 }
 {tab==='extraOrders'&&<ExtraOrdersPanel data={data} order={order} setOrder={setOrder} addExtraOrder={addExtraOrder} deleteExtraOrder={deleteExtraOrder}/>} 
 {tab==='shopOrders'&&<ShopOrdersPanel data={data} shopOrder={shopOrder} setShopOrder={setShopOrder} addShopOrder={addShopOrder} deleteExtraOrder={deleteExtraOrder}/>} 
 {tab==='initialTrainings'&&<InitialTrainingsPanel data={data} training={training} setTraining={setTraining} addInitialTraining={addInitialTraining} deleteExtraOrder={deleteExtraOrder}/>} 
 {tab==='ai'&&<div className="panel"><h1>AI analiza rentowności</h1><button className="orange" onClick={runAi}>Uruchom AI analizę</button><p>{ai||'AI obliczy rentowność każdego klienta i poda konkretne podpowiedzi. Uwzględnia obsługę miesięczną, zlecenia dodatkowe, dojazdy, koszty dodatkowe i koszt czasu pracy.'}</p></div>}
 {tab==='charts'&&<ChartPanel title="Wykres czasu pracy" rows={stats.rows.slice().sort((a,b)=>b.hours-a.hours).slice(0,12)} dataKey="hours" color="#ff5a14"/>}
 {tab==='profitCharts'&&<ChartPanel title="Wykres rentowności" rows={stats.rows.filter(r=>r.minutes||r.netTotal).sort((a,b)=>b.profit-a.profit).slice(0,12)} dataKey="profit" color="#132734"/>}
 {tab==='import'&&<div className="panel"><h1>Import danych</h1><p>Excel: Nazwa firmy, Kwota, Uwagi, Pracownik. Wartość BIURO przypisze firmę do Arkadiusza Źrebca.</p><form action="/api/import/excel" method="post" encType="multipart/form-data"><input type="file" name="file" accept=".xlsx,.csv"/><button className="orange">Import danych</button></form></div>}
 {tab==='export'&&
  <div className="panel">
    <h1>Eksporty</h1>

    <div className="card" style={{maxWidth:700}}>
      <h2>Eksport raportu za miesiąc</h2>

      <label>
        Miesiąc:
        <input
          type="month"
          value={selectedMonth}
          onChange={e=>setSelectedMonth(e.target.value)}
          style={{marginLeft:8, maxWidth:180}}
        />
      </label>

      <p className="muted" style={{marginTop:10}}>
        Eksporty pobierają dane tylko z wybranego miesiąca: wpisy pracy, zlecenia dodatkowe, szkolenia i rentowność.
      </p>

      <div className="row" style={{marginTop:16}}>
        <a className="btn orange" href={`/api/export/excel?month=${selectedMonth}`}>
          Excel za miesiąc
        </a>

        <a className="btn" href={`/api/export/csv?month=${selectedMonth}`}>
          CSV za miesiąc
        </a>

        <a className="btn" href={`/api/export/pdf?month=${selectedMonth}`} target="_blank">
          PDF za miesiąc
        </a>
      </div>
    </div>
  </div>
}
 {tab==='security'&&
  <div className="panel">
    <h1>Bezpieczeństwo i konto</h1>

    <p>
      Zalogowano jako: <b>{user.name}</b> ({user.role})
    </p>

    <h2>Backup systemu</h2>

    <div className="backupBar">
      Ostatni backup: {new Date().toISOString()} (daily)
    </div>

    <div className="row" style={{marginTop:12, marginBottom:18}}>
  <a className="btn red" href="/api/backup/download">
    Pobierz backup SQL
  </a>

  <form
    onSubmit={async (e) => {
      e.preventDefault();

      if (!confirm("UWAGA: To nadpisze aktualną bazę danych. Przywrócić backup?")) {
        return;
      }

      const formData = new FormData(e.currentTarget);

      const res = await fetch("/api/backup/restore", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        alert(result.error || "Błąd przywracania backupu");
        return;
      }

      alert("Backup przywrócony. Aplikacja zostanie odświeżona.");
      location.reload();
    }}
    style={{display:"inline-flex", gap:8, alignItems:"center", flexWrap:"wrap"}}
  >
    <input
      name="file"
      type="file"
      accept=".sql"
      required
      style={{maxWidth:280}}
    />

    <button className="red" type="submit">
      Przywróć backup SQL
    </button>
  </form>
</div>
<button
  className="red"
  type="button"
  onClick={async () => {
    if (!confirm("UWAGA: To usunie firmy, wpisy pracy i zlecenia. Kontynuować?")) return;
    if (!confirm("Na pewno? Tej operacji nie cofniesz bez backupu SQL.")) return;

    const res = await fetch("/api/admin/clear-data", {
      method: "POST",
    });

    const result = await res.json();

    if (!res.ok) {
      alert(result.error || "Błąd czyszczenia danych");
      return;
    }

    alert("Dane testowe usunięte.");
    location.reload();
  }}
>
  Wyczyść dane testowe
</button>
    <h2>Ostatnie zdarzenia</h2>
    <AuditTable/>
  </div>
}
 {tab==='users'&&<UsersPanel data={data} editUser={editUser} setEditUser={setEditUser} addUser={addUser} saveUser={saveUser} deleteUser={deleteUser}/>} 
 {tab==='account'&&
  <div className="panel">
    <h1>Moje konto</h1>

    <div className="card" style={{maxWidth:520}}>
      <h2>Zmiana hasła</h2>

      <form onSubmit={async e=>{
        e.preventDefault();

        const form = e.currentTarget;

        const body = {
          currentPassword: form.currentPassword.value,
          newPassword: form.newPassword.value,
          repeatPassword: form.repeatPassword.value
        };

        try {
          await jsonFetch('/api/account/change-password', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify(body)
          });

          alert('Hasło zostało zmienione.');
          form.reset();
        } catch(err) {
          alert(err.message);
        }
      }}>
        <Field label="Aktualne hasło">
          <input name="currentPassword" type="password" required />
        </Field>

        <Field label="Nowe hasło">
          <input name="newPassword" type="password" required />
        </Field>

        <Field label="Powtórz nowe hasło">
          <input name="repeatPassword" type="password" required />
        </Field>

        <button className="orange" type="submit">
          Zmień hasło
        </button>
      </form>
    </div>
  </div>
} 
 {tab==='pwa'&&<div className="panel"><h1>Aplikacja mobilna PWA</h1><p><b>Android:</b> Chrome → trzy kropki → Dodaj do ekranu głównego.</p><p><b>iPhone:</b> Safari → Udostępnij → Do ekranu początkowego.</p></div>}
 </div>

 <button
  type="button"
  onClick={()=>setQuickNotesOpen(true)}
  style={{
   position:'fixed',
   right:20,
   bottom:20,
   zIndex:999,
   width:58,
   height:58,
   borderRadius:'50%',
   border:'none',
   background:'#ff5a14',
   color:'#fff',
   fontSize:25,
   cursor:'pointer',
   boxShadow:'0 8px 24px rgba(0,0,0,0.25)'
  }}
 >
  📝
 </button>

 {quickNotesOpen&&
  <div
   style={{
    position:'fixed',
    top:0,
    right:0,
    width:'min(420px, 100vw)',
    height:'100vh',
    background:'#fff',
    zIndex:1000,
    boxShadow:'-8px 0 30px rgba(0,0,0,0.25)',
    padding:20,
    overflowY:'auto'
   }}
  >
   <div className="row between">
    <h2>📝 Szybkie notatki</h2>

    <button
     type="button"
     className="light"
     onClick={()=>setQuickNotesOpen(false)}
    >
     ✕
    </button>
   </div>

   <div className="card">
    <textarea
     placeholder="Wpisz szybką notatkę..."
     value={quickNoteContent}
     onChange={e=>setQuickNoteContent(e.target.value)}
     style={{minHeight:120}}
    />

    <select
     value={quickNoteCompanyId}
     onChange={e=>setQuickNoteCompanyId(e.target.value)}
    >
     <option value="">Firma opcjonalnie</option>

     {data.companies
      .filter(c=>c.status!=='INACTIVE')
      .map(c=>
       <option key={c.id} value={c.id}>
        {c.name}
       </option>
      )}
    </select>

    <button
     type="button"
     className="orange"
     onClick={addQuickNote}
    >
     Zapisz notatkę
    </button>
   </div>

   <div style={{marginTop:20}}>
    <h3>Moje notatki</h3>

    {quickNotesLoading&&
     <p className="muted">
      Ładowanie...
     </p>
    }

    {!quickNotesLoading&&quickNotes.length===0&&
     <p className="muted">
      Brak notatek.
     </p>
    }

    {quickNotes.map(note=>
     <div
      key={note.id}
      className="card"
      style={{marginBottom:12}}
     >
      <div style={{whiteSpace:'pre-wrap'}}>
       {note.content}
      </div>

      <div
       className="muted"
       style={{marginTop:8}}
      >
       {note.company?.name||'Bez przypisanej firmy'}
      </div>

      <div className="muted">
       {new Date(note.createdAt).toLocaleString('pl-PL')}
      </div>
     </div>
    )}
   </div>
  </div>
 }

 </main>
 </div>
}


function SummaryTable({rows, selectedMonth}){

 const [sort,setSort]=useState({
  key:'profit',
  direction:'desc'
 });

 function sortRows(list){
  const sorted=[...list];

  sorted.sort((a,b)=>{
   let av=a[sort.key];
   let bv=b[sort.key];

   if(typeof av==='string'){
    av=av.toLowerCase();
    bv=bv.toLowerCase();
   }

   if(av>bv)return sort.direction==='asc'?1:-1;
   if(av<bv)return sort.direction==='asc'?-1:1;

   return 0;
  });

  return sorted;
 }

 function toggleSort(key){
  setSort(prev=>({
   key,
   direction:
    prev.key===key
     ? prev.direction==='asc'
       ? 'desc'
       : 'asc'
     : 'desc'
  }));
 }

 function arrow(key){
  if(sort.key!==key)return '↕';

  return sort.direction==='asc'
   ? '↑'
   : '↓';
 }

 const sortedRows=sortRows(rows);

 return (
  <div className="card">
   <h2>Podsumowanie</h2>

   <div className="tableWrap">
    <table>
     <thead>
      <tr>
       <th onClick={()=>toggleSort('name')} style={{cursor:'pointer'}}>
        Firma {arrow('name')}
       </th>

       <th onClick={()=>toggleSort('minutes')} style={{cursor:'pointer'}}>
        Godziny {arrow('minutes')}
       </th>

       <th onClick={()=>toggleSort('netMonthly')} style={{cursor:'pointer'}}>
        Kwota miesięczna {arrow('netMonthly')}
       </th>

       <th onClick={()=>toggleSort('netOrders')} style={{cursor:'pointer'}}>
        Zlecenia dodatkowe {arrow('netOrders')}
       </th>

       <th onClick={()=>toggleSort('trainingAmount')} style={{cursor:'pointer'}}>
        Szkolenia wstępne {arrow('trainingAmount')}
       </th>

       <th onClick={()=>toggleSort('costs')} style={{cursor:'pointer'}}>
        Koszty {arrow('costs')}
       </th>

       <th onClick={()=>toggleSort('timeCost')} style={{cursor:'pointer'}}>
        Koszt czasu {arrow('timeCost')}
       </th>

       <th onClick={()=>toggleSort('profit')} style={{cursor:'pointer'}}>
        Zysk po kosztach {arrow('profit')}
       </th>

       <th onClick={()=>toggleSort('rate')} style={{cursor:'pointer'}}>
        Stawka/h {arrow('rate')}
       </th>

       <th onClick={()=>toggleSort('rent')} style={{cursor:'pointer'}}>
        Rentowność {arrow('rent')}
       </th>
       <th>PDF</th>
      </tr>
     </thead>

     <tbody>
      {sortedRows.map(r=>
       <tr key={r.id}>
        <td>
         <span className={'status '+r.status}></span>
         {r.name}
        </td>

        <td>{minToText(r.minutes)}</td>
        <td>{money(r.netMonthly)}</td>
        <td>{money(r.netOrders)}</td>
        <td>{money(r.trainingAmount||0)}</td>
        <td>{money(r.costs||0)}</td>
        <td>{money(r.timeCost||0)}</td>
        <td>{money(r.profit||0)}</td>
        <td>{r.rate.toFixed(2)} zł/h</td>
        <td>{r.rent}</td>
        <td>
  <button
    className="orange"
    type="button"
    onClick={() => generateProfitPdf(r, selectedMonth)}
  >
    PDF
  </button>
</td>
       </tr>
      )}
     </tbody>
    </table>
   </div>

   <p className="muted">
    Rentowność = kwota netto miesięczna + zlecenia dodatkowe + szkolenia wstępne - koszt dojazdów - dodatkowe koszty - koszt czasu pracy.
   </p>
  </div>
 )
}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
function CompanyDetails({company,users,orders,onSubmit,onDelete}){
 const missing=['address','contactPerson','phone','email'].filter(k=>!company[k]);
 return <form id="companyEditForm" className="detailBox" onSubmit={onSubmit}><div className="row between"><h2>Dane firmy: {company.name}</h2><button type="button" className="red" onClick={onDelete}>🗑️ Usuń firmę</button></div>{missing.length>0&&<div className="warnBox">Brakuje danych: {missing.join(', ')}. Możesz wpisać NIP i kliknąć „Uzupełnij puste dane z NIP”.</div>}<div className="companyInfo"><div className="infoBox"><b>Kontakt</b>{company.contactPerson||'brak danych'}</div><div className="infoBox"><b>Email</b>{company.email||'brak danych'}</div><div className="infoBox"><b>Telefon</b>{company.phone||'brak danych'}</div><div className="infoBox"><b>Adres</b>{company.address||'brak danych'}</div><div className="infoBox"><b>Pracownik</b>{company.assignedUser?.name||'nie przypisano'}</div><div className="infoBox"><b>Status firmy</b><span className={'status '+company.status}></span>{company.status}</div></div><div className="grid2"><Field label="Nazwa firmy"><input name="name" defaultValue={company.name}/></Field><Field label="NIP"><input name="nip" defaultValue={company.nip||''} placeholder="NIP" onBlur={e=>autofillByNip(e.currentTarget.form)}/></Field><Field label="Adres"><input name="address" defaultValue={company.address||''} placeholder="Adres"/></Field><Field label="Osoba kontaktowa"><input name="contactPerson" defaultValue={company.contactPerson||''} placeholder="Osoba kontaktowa"/></Field><Field label="Telefon"><input name="phone" defaultValue={company.phone||''} placeholder="Telefon"/></Field><Field label="Email"><input name="email" defaultValue={company.email||''} placeholder="Email"/></Field><Field label="Typ obsługi"><input name="serviceType" defaultValue={company.serviceType||''} placeholder="np. BHP, stała obsługa"/></Field><Field label="Przypisany pracownik"><select name="assignedUserId" defaultValue={company.assignedUserId||''}><option value="">Brak pracownika</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Field><Field label="Status firmy"><select name="status" defaultValue={company.status}><option value="ACTIVE">aktywna</option><option value="PAUSED">zawieszona</option><option value="INACTIVE">nieaktywna</option></select></Field><Field label="Typ rozliczenia"><select name="billingType" defaultValue={company.billingType}><option value="MONTHLY">miesięczne</option><option value="ONE_TIME">jednorazowe</option><option value="HOURLY">godzinowe</option></select></Field><Field label="Kwota netto miesięcznie"><input name="netAmount" defaultValue={company.netAmount||''} placeholder="Kwota netto miesięcznie"/></Field><Field label="Koszt dojazdów"><input name="travelCost" defaultValue={company.travelCost||''} placeholder="Koszt dojazdów"/></Field><Field label="Dodatkowe koszty"><input name="extraCost" defaultValue={company.extraCost||''} placeholder="Dodatkowe koszty"/></Field><Field label="Opis dodatkowych kosztów / uwagi"><input name="extraCostDescription" defaultValue={company.extraCostDescription||''} placeholder="np. ratownik medyczny, PO, mail po angielsku"/></Field></div><div className="row"><button type="button" className="light" onClick={e=>autofillByNip(e.currentTarget.form)}>Uzupełnij puste dane z NIP</button><button className="orange">Zapisz zmiany firmy</button></div>{orders?.length>0&&<div className="card"><h3>Zlecenia dodatkowe tej firmy</h3><table><thead><tr><th>Data</th><th>Nazwa</th><th>Czas</th><th>Kwota</th><th>Koszty</th><th>Koszt czasu</th><th>Status</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>{String(o.date).slice(0,10)}</td><td>{o.title}</td><td>{minToText(Number(o.minutes||0))}</td><td>{money(o.netAmount)}</td><td>{money(Number(o.travelCost||0)+Number(o.extraCost||0))}</td><td>{money((Number(o.minutes||0)/60)*250)}</td><td>{o.status}</td></tr>)}</tbody></table></div>}</form>}
function InitialTrainingsPanel({data,training,setTraining,addInitialTraining,deleteExtraOrder}){const people=Number(training.peopleCount||0);const unit=Number(training.unitAmount||0);const autoTotal=people*unit;const trainings=(data.extraOrders||[]).filter(o=>String(o.type||'').toLowerCase()==='szkolenie wstępne');return <div className="panel"><h1>Szkolenia wstępne</h1><form className="card" onSubmit={addInitialTraining}><h2>Dodaj szkolenie wstępne</h2><div className="grid2"><Field label="Data szkolenia"><input type="date" value={training.date} onChange={e=>setTraining({...training,date:e.target.value})}/></Field><Field label="Firma z obsługi"><select value={training.companyId} onChange={e=>setTraining({...training,companyId:e.target.value,newCompanyName:e.target.value?'':training.newCompanyName})}><option value="">Wybierz firmę z listy</option>{data.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Albo dopisz nową firmę"><input placeholder="Nazwa nowej firmy, jeśli nie ma jej na liście" value={training.newCompanyName} onChange={e=>setTraining({...training,newCompanyName:e.target.value,companyId:e.target.value?training.companyId:''})}/></Field><Field label="Czas poświęcony na szkolenie"><input placeholder="domyślnie 1:00" value={training.time} onChange={e=>setTraining({...training,time:e.target.value})}/></Field><Field label="Kwota netto za osobę"><input type="number" placeholder="np. 109" value={training.unitAmount} onChange={e=>{const unitAmount=e.target.value;const peopleCount=Number(training.peopleCount||1);setTraining({...training,unitAmount,netAmount:String(Number(unitAmount||0)*peopleCount)})}}/></Field><Field label="Ilość osób na szkoleniu"><input type="number" min="1" placeholder="np. 5" value={training.peopleCount} onChange={e=>{const peopleCount=e.target.value;const unitAmount=Number(training.unitAmount||0);setTraining({...training,peopleCount,netAmount:String(unitAmount*Number(peopleCount||0))})}}/></Field><Field label="Wartość szkolenia — automatycznie albo wpisz ręcznie"><input
  name="netAmount"
  type="number"
  placeholder={`Automatycznie: ${autoTotal || 0} zł, albo wpisz ręcznie`}
  value={training.netAmount||''}
  onChange={e=>setTraining({...training,netAmount:e.target.value})}
/></Field><Field label="Status"><select value={training.status} onChange={e=>setTraining({...training,status:e.target.value})}><option value="DONE">wykonane</option><option value="OPEN">otwarte</option><option value="INVOICED">zafakturowane</option><option value="PAID">opłacone</option></select></Field><Field label="Opis kosztów dodatkowych"><input placeholder="np. materiały, sala, dojazd, ratownik" value={training.extraCostDescription} onChange={e=>setTraining({...training,extraCostDescription:e.target.value})}/></Field></div><Field label="Opis szkolenia"><textarea placeholder="np. szkolenie wstępne BHP dla nowych pracowników" value={training.description} onChange={e=>setTraining({...training,description:e.target.value})}/></Field><p className="muted">Po dodaniu szkolenie zostanie podpięte pod wybraną firmę. Kwota szkolenia będzie przychodem firmy, a czas szkolenia doliczy się do godzin w podsumowaniu.</p><button className="orange">Dodaj szkolenie</button></form><div className="card"><h2>Lista szkoleń wstępnych</h2><div className="tableWrap"><table><thead><tr><th>Data</th><th>Firma</th><th>Czas</th><th>Wartość szkolenia</th><th>Opis kosztów</th><th>Status</th><th>Akcje</th></tr></thead><tbody>{trainings.map(o=><tr key={o.id}><td>{String(o.date).slice(0,10)}</td><td>{o.company?.name||'-'}</td><td>{minToText(Number(o.minutes||0))}</td><td>{money(o.netAmount)}</td><td>{o.extraCostDescription||'-'}</td><td>{o.status}</td><td><button className="light iconBtn" onClick={()=>deleteExtraOrder(o)}>🗑️</button></td></tr>)}</tbody></table></div></div></div>}

function ExtraOrdersPanel({data,order,setOrder,addExtraOrder,deleteExtraOrder}){return <div className="panel"><h1>Zlecenia dodatkowe</h1><form className="card" onSubmit={addExtraOrder}><h2>Dodaj zlecenie poza miesięczną obsługą</h2><div className="grid2"><Field label="Data zlecenia"><input type="date" value={order.date} onChange={e=>setOrder({...order,date:e.target.value})}/></Field><Field label="Firma"><select value={order.companyId} onChange={e=>setOrder({...order,companyId:e.target.value,newCompanyName:e.target.value?'':order.newCompanyName})}><option value="">Wybierz firmę</option>{data.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Albo wpisz nową firmę"><input placeholder="Nazwa nowej firmy, jeśli nie ma jej na liście" value={order.newCompanyName||''} onChange={e=>setOrder({...order,newCompanyName:e.target.value,companyId:e.target.value?'':order.companyId})}/></Field><Field label="Nazwa zlecenia"><input placeholder="np. Szkolenie robotnicze" value={order.title} onChange={e=>setOrder({...order,title:e.target.value})}/></Field><Field label="Typ zlecenia"><select value={order.type} onChange={e=>setOrder({...order,type:e.target.value})}>{orderTypes.map(t=><option key={t}>{t}</option>)}</select></Field><Field label="Numer zlecenia / PO"><input placeholder="opcjonalnie" value={order.orderNumber} onChange={e=>setOrder({...order,orderNumber:e.target.value})}/></Field><Field label="Status"><select value={order.status} onChange={e=>setOrder({...order,status:e.target.value})}><option value="OPEN">otwarte</option><option value="DONE">wykonane</option><option value="INVOICED">zafakturowane</option><option value="PAID">opłacone</option></select></Field><Field label="Czas poświęcony na zlecenie"><input placeholder="np. 4:00, 2h 30m, 150m" value={order.time} onChange={e=>setOrder({...order,time:e.target.value})}/></Field><Field label="Kwota netto za zlecenie"><input type="number" placeholder="np. 1500" value={order.netAmount} onChange={e=>setOrder({...order,netAmount:e.target.value})}/></Field><Field label="Koszt dojazdów"><input type="number" placeholder="np. 200" value={order.travelCost} onChange={e=>setOrder({...order,travelCost:e.target.value})}/></Field><Field label="Dodatkowe koszty"><input type="number" placeholder="np. ratownik 500" value={order.extraCost} onChange={e=>setOrder({...order,extraCost:e.target.value})}/></Field><Field label="Opis dodatkowych kosztów"><input placeholder="np. ratownik medyczny, sala, materiały" value={order.extraCostDescription} onChange={e=>setOrder({...order,extraCostDescription:e.target.value})}/></Field></div><Field label="Opis zlecenia"><textarea placeholder="Opis wykonania / uwagi" value={order.description} onChange={e=>setOrder({...order,description:e.target.value})}/></Field><button className="orange">Dodaj zlecenie</button></form><div className="card"><h2>Lista zleceń dodatkowych</h2><div className="tableWrap"><table><thead><tr><th>Data</th><th>Firma</th><th>Nazwa</th><th>Typ</th><th>Czas</th><th>Kwota</th><th>Koszty</th><th>Koszt czasu</th><th>Zysk</th><th>Status</th><th>Akcje</th></tr></thead><tbody>{(data.extraOrders||[]).filter(o=>!['szkolenie wstępne','zlecenie sklep'].includes(String(o.type||'').toLowerCase())).map(o=>{const costs=Number(o.travelCost||0)+Number(o.extraCost||0);const timeCost=(Number(o.minutes||0)/60)*250;const profit=Number(o.netAmount||0)-costs-timeCost;return <tr key={o.id}><td>{String(o.date).slice(0,10)}</td><td>{o.company?.name||'-'}</td><td>{o.title}</td><td>{o.type}</td><td>{minToText(Number(o.minutes||0))}</td><td>{money(o.netAmount)}</td><td>{money(costs)}</td><td>{money(timeCost)}</td><td>{money(profit)}</td><td>{o.status}</td><td><button className="light iconBtn" onClick={()=>deleteExtraOrder(o)}>🗑️</button></td></tr>})}</tbody></table></div></div></div>}

function ShopOrdersPanel({data,shopOrder,setShopOrder,addShopOrder,deleteExtraOrder}){
 const shopOrders=(data.extraOrders||[]).filter(o=>String(o.type||'').toLowerCase()==='zlecenie sklep');
 return <div className="panel"><h1>Zlecenia Sklep</h1><form className="card" onSubmit={addShopOrder}><h2>Dodaj zlecenie sklep</h2><div className="grid2">
  <Field label="Data zlecenia"><input type="date" value={shopOrder.date} onChange={e=>setShopOrder({...shopOrder,date:e.target.value})}/></Field>
  <Field label="Firma"><select value={shopOrder.companyId} onChange={e=>setShopOrder({...shopOrder,companyId:e.target.value,newCompanyName:e.target.value?'':shopOrder.newCompanyName})}><option value="">Wybierz firmę</option>{data.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
  <Field label="Albo wpisz nową firmę"><input placeholder="Nazwa nowej firmy, jeśli nie ma jej na liście" value={shopOrder.newCompanyName||''} onChange={e=>setShopOrder({...shopOrder,newCompanyName:e.target.value,companyId:e.target.value?'':shopOrder.companyId})}/></Field>
  <Field label="Czas poświęcony na zlecenie"><input placeholder="np. 4:00, 2h 30m, 150m" value={shopOrder.time} onChange={e=>setShopOrder({...shopOrder,time:e.target.value})}/></Field>
  <Field label="Status"><select value={shopOrder.status} onChange={e=>setShopOrder({...shopOrder,status:e.target.value})}><option value="OPEN">otwarte</option><option value="DONE">wykonane</option><option value="INVOICED">zafakturowane</option><option value="PAID">opłacone</option></select></Field>
  <Field label="Kwota netto za zlecenie"><input type="number" placeholder="np. 1500" value={shopOrder.netAmount} onChange={e=>setShopOrder({...shopOrder,netAmount:e.target.value})}/></Field>
  <Field label="Nazwa zlecenia"><input placeholder="np. sklep / dostawa / sprzedaż" value={shopOrder.title} onChange={e=>setShopOrder({...shopOrder,title:e.target.value})}/></Field>
  <Field label="Marża"><input type="number" placeholder="np. 200" value={shopOrder.margin} onChange={e=>setShopOrder({...shopOrder,margin:e.target.value})}/></Field>
  <Field label="Koszt dojazdów"><input type="number" placeholder="np. 200" value={shopOrder.travelCost} onChange={e=>setShopOrder({...shopOrder,travelCost:e.target.value})}/></Field>
  <Field label="Dodatkowe koszty"><input type="number" placeholder="np. ratownik 500" value={shopOrder.extraCost} onChange={e=>setShopOrder({...shopOrder,extraCost:e.target.value})}/></Field>
  <Field label="Opis dodatkowych kosztów"><input placeholder="np. ratownik medyczny, sala, materiały" value={shopOrder.extraCostDescription} onChange={e=>setShopOrder({...shopOrder,extraCostDescription:e.target.value})}/></Field>
 </div><Field label="Opis zlecenia"><textarea placeholder="Opis wykonania / uwagi" value={shopOrder.description} onChange={e=>setShopOrder({...shopOrder,description:e.target.value})}/></Field><button className="orange">Dodaj zlecenie</button></form>
 <div className="card"><h2>Lista zleceń sklep</h2><div className="tableWrap"><table><thead><tr><th>Data</th><th>Firma</th><th>Nazwa</th><th>Czas</th><th>Kwota netto</th><th>Marża</th><th>Koszty</th><th>Podsumowanie</th><th>Status</th><th>Akcje</th></tr></thead><tbody>{shopOrders.map(o=>{const timeCost=(Number(o.minutes||0)/60)*250;const costs=Number(o.travelCost||0)+Number(o.extraCost||0)+timeCost;const margin=getShopMargin(o);const profit=margin-costs;return <tr key={o.id}><td>{String(o.date).slice(0,10)}</td><td>{o.company?.name||'-'}</td><td>{o.title}</td><td>{minToText(Number(o.minutes||0))}</td><td>{money(o.netAmount)}</td><td>{money(margin)}</td><td>{money(costs)}</td><td>{money(profit)} {profit>=0?'zysku':'straty'}</td><td>{o.status}</td><td><button className="light iconBtn" onClick={()=>deleteExtraOrder(o)}>🗑️</button></td></tr>})}</tbody></table></div></div></div>
}


function WorkerStatsPanel({ data }) {
  const [workerFilter, setWorkerFilter] = useState('ALL');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [editEntry, setEditEntry] = useState(null);

  const companyName = (id) =>
    data.companies.find(c => c.id === id)?.name || 'Firma spoza listy';

  const workerName = (entry) =>
    entry.user?.name ||
    entry.userName ||
    data.users.find(u => u.id === entry.userId)?.name ||
    data.users.find(u => u.id === entry.createdById)?.name ||
    entry.createdBy?.name ||
    'Nieznany pracownik';

  const entries = useMemo(() => {
    return (data.workEntries || [])
      .map(e => ({
        ...e,
        worker: workerName(e),
        company: companyName(e.companyId),
        dateText: String(e.date || '').slice(0, 10)
      }))
      .filter(e =>
        (workerFilter === 'ALL' || e.worker === workerFilter) &&
        (companyFilter === 'ALL' || e.companyId === companyFilter)
      )
      .sort((a, b) =>
        a.worker.localeCompare(b.worker, 'pl') ||
        a.company.localeCompare(b.company, 'pl') ||
        new Date(b.date) - new Date(a.date)
      );
  }, [data.workEntries, data.companies, data.users, workerFilter, companyFilter]);

  const workers = [...new Set((data.workEntries || []).map(e => workerName(e)))]
    .sort((a, b) => a.localeCompare(b, 'pl'));

  const totalMinutes = entries.reduce((s, r) => s + Number(r.minutes || 0), 0);
  const totalEntries = entries.length;
  const totalExtraCosts = entries.reduce((s, r) => s + Number(r.additionalCost || 0), 0);

  async function deleteEntry(entry) {
    if (!confirm(`Usunąć wpis pracy: ${entry.worker} / ${entry.company}?`)) return;

    try {
      await jsonFetch('/api/work/' + entry.id, { method: 'DELETE' });
      alert('Wpis usunięty.');
      location.reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function saveEntry(e) {
    e.preventDefault();

    try {
      const form = e.currentTarget;

      const body = {
        date: form.date.value,
        companyId: form.companyId.value,
        orderNumber: form.orderNumber.value,
        type: form.type.value,
        title: form.description.value || form.type.value,
        description: form.description.value,
        minutes: parseTime(form.time.value),
        travelMinutes: parseTime(form.travelTime.value),
        additionalCost: Number(form.additionalCost.value || 0),
        additionalCostDescription: form.additionalCostDescription.value
      };

      await jsonFetch('/api/work/' + editEntry.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      alert('Wpis zapisany.');
      setEditEntry(null);
      location.reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="panel">
      <h1>Pracownicy</h1>

      <div className="kpis">
        <div className="card">Pracownicy<h2>{workers.length}</h2></div>
        <div className="card">Firmy w zestawieniu<h2>{new Set(entries.map(r => r.company)).size}</h2></div>
        <div className="card">Łączny czas<h2>{minToText(totalMinutes)}</h2></div>
        <div className="card">Ilość wpisów<h2>{totalEntries}</h2></div>
      </div>

      <div className="card">
        <h2>Wpisy pracy pracowników</h2>

        <div className="grid2">
          <Field label="Filtr pracownika">
            <select value={workerFilter} onChange={e => setWorkerFilter(e.target.value)}>
              <option value="ALL">Wszyscy pracownicy</option>
              {workers.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </Field>

          <Field label="Filtr firmy">
            <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
              <option value="ALL">Wszystkie firmy</option>
              {data.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Pracownik</th>
                <th>Firma</th>
                <th>Typ</th>
                <th>Opis</th>
                <th>Czas pracy</th>
                <th>Czas dojazdu</th>
                <th>Koszty</th>
                <th>Opis kosztu</th>
                <th>Akcje</th>
              </tr>
            </thead>

            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td>{e.dateText}</td>
                  <td>{e.worker}</td>
                  <td>{e.company}</td>
                  <td>{e.type}</td>
                  <td>{e.description || '-'}</td>
                  <td>{minToText(Number(e.minutes || 0))}</td>
                  <td>{minToText(Number(e.travelMinutes || 0))}</td>
                  <td>{money(e.additionalCost || 0)}</td>
                  <td>{e.additionalCostDescription || '-'}</td>
                  <td>
                    <button className="light iconBtn" onClick={() => setEditEntry(e)}>✏️</button>
                    <button className="light iconBtn" onClick={() => deleteEntry(e)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="muted">
          Łączne koszty dodatkowe: {money(totalExtraCosts)}. Tutaj możesz edytować albo usuwać pojedyncze wpisy pracy.
        </p>
      </div>

      {editEntry && (
        <div className="card" style={{ maxWidth: 760, marginTop: 20 }}>
          <h2>Edytuj wpis pracy</h2>

          <form onSubmit={saveEntry}>
            <Field label="Data">
              <input name="date" type="date" defaultValue={String(editEntry.date || '').slice(0, 10)} />
            </Field>

            <Field label="Firma">
              <select name="companyId" defaultValue={editEntry.companyId || ''}>
                {data.companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Numer zlecenia">
              <input name="orderNumber" defaultValue={editEntry.orderNumber || ''} />
            </Field>

            <Field label="Typ pracy">
              <select name="type" defaultValue={editEntry.type || 'inne'}>
                {workTypes.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>

            <Field label="Opis wykonanych prac">
              <textarea name="description" defaultValue={editEntry.description || ''} />
            </Field>

            <Field label="Czas pracy">
              <input name="time" defaultValue={minToText(Number(editEntry.minutes || 0))} />
            </Field>

            <Field label="Czas dojazdu">
              <input name="travelTime" defaultValue={minToText(Number(editEntry.travelMinutes || 0))} />
            </Field>

            <Field label="Dodatkowy koszt">
              <input name="additionalCost" type="number" defaultValue={editEntry.additionalCost || 0} />
            </Field>

            <Field label="Opis kosztu">
              <input name="additionalCostDescription" defaultValue={editEntry.additionalCostDescription || ''} />
            </Field>

            <div className="row" style={{ marginTop: 12 }}>
              <button className="orange" type="submit">Zapisz zmiany</button>
              <button className="light" type="button" onClick={() => setEditEntry(null)}>Anuluj</button>
              <button className="red" type="button" onClick={() => deleteEntry(editEntry)}>Usuń wpis</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function EmployeeCard({u,onEdit,onDelete}){return <div className="card employeeCard"><div><h2>{u.name}</h2><p>ID: {u.id.slice(0,6)} | Login: {u.email}</p><span className="pill">{u.role==='ADMIN'?'Administrator':'BHP'}</span> <span className="pill green">{u.active?'Aktywny':'Nieaktywny'}</span></div><div className="employeeActions"><button className="light iconBtn" title="Edytuj" onClick={onEdit}>✏️</button><button className="light iconBtn" title="Usuń" onClick={onDelete}>🗑️</button></div></div>}
function UsersPanel({data,editUser,setEditUser,addUser,saveUser,deleteUser}){return <div className="panel">{!editUser&&<><h1>Użytkownicy i role</h1><form className="card" onSubmit={addUser}><h2>Dodaj użytkownika</h2><div className="grid2"><input name="email" placeholder="Login nowego użytkownika" required/><input name="name" placeholder="Imię i nazwisko" required/><input name="password" type="password" placeholder="Hasło tymczasowe" required/><select name="role"><option value="ADMIN">Administrator</option><option value="WORKER">BHP / Pracownik</option></select></div><h3>Uprawnienia</h3><div className="permGrid">{modules.map(([k,l])=><label key={k}><input name={'perm_'+k} type="checkbox" defaultChecked={k==='work'||k==='pwa'}/> {l}</label>)}</div><button>Dodaj użytkownika</button></form><h2>Lista użytkowników</h2>{data.users.map(u=><div className="card employeeCard" key={u.id}><div><h3>{u.name}</h3><p>ID: {u.id.slice(0,6)} | Login: {u.email}</p><span className="pill">{u.role}</span> <span className="pill green">{u.active?'Aktywny':'Nieaktywny'}</span></div><div className="employeeActions"><button className="light iconBtn" onClick={()=>setEditUser(u)}>✏️</button><button className="light iconBtn" onClick={()=>deleteUser(u)}>🗑️</button></div></div>)}</>}{editUser&&<form className="card" onSubmit={saveUser}><h1>✏️ Edycja konta użytkownika</h1><button type="button" className="light" onClick={()=>setEditUser(null)}>← Wróć do listy użytkowników</button><div className="grid2"><input name="email" defaultValue={editUser.email}/><input name="name" defaultValue={editUser.name}/><select name="role" defaultValue={editUser.role}><option value="ADMIN">Administrator</option><option value="WORKER">BHP / Pracownik</option></select><label><input name="active" type="checkbox" defaultChecked={editUser.active} style={{width:'auto'}}/> Konto aktywne</label></div><h2>Uprawnienia</h2><div className="permGrid">{modules.map(([k,l])=><label key={k}><input name={'perm_'+k} type="checkbox" defaultChecked={!!editUser.permissions?.[k]}/> {l}</label>)}</div><input name="password" type="password" placeholder="Nowe hasło — zostaw puste, jeśli nie chcesz zmieniać"/><button>Zapisz zmiany</button> <button type="button" className="red" onClick={()=>deleteUser(editUser)}>Usuń użytkownika</button></form>}</div>}
function ChartPanel({title,rows,dataKey,color}){return <div className="panel"><h1>{title}</h1><div className="card chartBox"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey={dataKey} fill={color}/></BarChart></ResponsiveContainer></div></div>}
function AuditTable(){return <div className="tableWrap"><table><thead><tr><th>id</th><th>event_time</th><th>username</th><th>action</th><th>details</th></tr></thead><tbody><tr><td>1</td><td>{new Date().toISOString()}</td><td>admin</td><td>LOGOWANIE</td><td>Udane logowanie</td></tr></tbody></table></div>}
async function generateProfitPdf(r, selectedMonth) {
  const doc = new jsPDF();

  const logo = await loadImage('/logo.png');

  if (logo) {
    doc.addImage(logo, 'PNG', 55, 12, 100, 35);
  }

  doc.setFontSize(18);
  doc.text('Raport rentownosci klienta', 20, 60);

  doc.setFontSize(11);
  doc.text(`Klient: ${cleanPdfText(r.name)}`, 20, 75);
  doc.text(`Okres: ${selectedMonth}`, 20, 83);

  doc.line(20, 90, 190, 90);

  doc.setFontSize(12);
  doc.text(`Przychod laczny: ${pdfMoney(r.netTotal)}`, 20, 105);
  doc.text(`Kwota miesieczna: ${pdfMoney(r.netMonthly)}`, 20, 115);
  doc.text(`Zlecenia dodatkowe: ${pdfMoney(r.netOrders)}`, 20, 125);
  doc.text(`Szkolenia wstepne: ${pdfMoney(r.trainingAmount || 0)}`, 20, 135);

  doc.text(`Koszty dodatkowe: ${pdfMoney(r.costs)}`, 20, 150);
  doc.text(`Koszt czasu pracy: ${pdfMoney(r.timeCost)}`, 20, 160);

  doc.line(20, 168, 190, 168);

  doc.setFontSize(15);
  doc.text(`Zysk po kosztach: ${pdfMoney(r.profit)}`, 20, 182);

  doc.setFontSize(12);
  doc.text(`Godziny: ${minToText(r.minutes)}`, 20, 195);
  doc.text(`Stawka efektywna: ${Number(r.rate || 0).toFixed(2)} zl/h`, 20, 205);
  doc.text(`Rentownosc: ${cleanPdfText(r.rent)}`, 20, 215);

  doc.setFontSize(9);
  doc.text('Safety Service - raport wygenerowany automatycznie', 20, 285);

  doc.save(`rentownosc-${cleanFileName(r.name)}-${selectedMonth}.pdf`);
}

function pdfMoney(value) {
  const n = Number(value || 0);
  return `${n.toFixed(2)} zl`;
}

function cleanPdfText(value) {
  return String(value || '')
    .replaceAll('ą', 'a')
    .replaceAll('ć', 'c')
    .replaceAll('ę', 'e')
    .replaceAll('ł', 'l')
    .replaceAll('ń', 'n')
    .replaceAll('ó', 'o')
    .replaceAll('ś', 's')
    .replaceAll('ż', 'z')
    .replaceAll('ź', 'z')
    .replaceAll('Ą', 'A')
    .replaceAll('Ć', 'C')
    .replaceAll('Ę', 'E')
    .replaceAll('Ł', 'L')
    .replaceAll('Ń', 'N')
    .replaceAll('Ó', 'O')
    .replaceAll('Ś', 'S')
    .replaceAll('Ż', 'Z')
    .replaceAll('Ź', 'Z');
}

function cleanFileName(value) {
  return cleanPdfText(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);

    img.src = src;
  });
}
