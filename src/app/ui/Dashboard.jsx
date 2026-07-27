'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import jsPDF from 'jspdf';
import CompanyMap from './CompanyMap';

const modules=[['dashboard','Podsumowanie'],['clients','Klienci'],['employees','Baza pracowników'],['workerStats','Pracownicy'],['work','Panel pracownika'],['missingReport','Raport braków'],['extraOrders','Zlecenia dodatkowe'],['shopOrders','Zlecenia Sklep'],['ai','AI analiza rentowności'],['charts','Wykres czasu pracy'],['profitCharts','Wykres rentowności'],['import','Import danych'],['export','Eksporty'],['security','Bezpieczeństwo i konto'],['users','Użytkownicy i role'],['account','Moje konto'],['pwa','PWA / telefon']];
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
function getCompanyHealth(row){
 const minutes=Number(row?.minutes||0);
 const income=Number(row?.netTotal||0);
 const costs=Number(row?.costs||0)+Number(row?.timeCost||0);
 const profit=Number(row?.profit||0);
 const rate=Number(row?.rate||0);

 if(minutes<=0&&income<=0&&costs<=0){
  return {key:'NO_DATA',label:'Brak danych',color:'#7b8794',background:'#f1f4f7'};
 }
 if(profit<0){
  return {key:'UNPROFITABLE',label:'Nierentowna',color:'#d9343a',background:'#fff0f1'};
 }
 if(rate<150){
  return {key:'AT_RISK',label:'Zagrożona',color:'#f07c00',background:'#fff4e8'};
 }
 if(rate<250||profit<3000){
  return {key:'WATCH',label:'Do obserwacji',color:'#b88900',background:'#fff9df'};
 }
 return {key:'VERY_GOOD',label:'Bardzo dobra',color:'#159447',background:'#edf9f1'};
}
function splitMinutesBetweenCompanies(totalMinutes, companyCount) {
  const total = Number(totalMinutes || 0);
  const count = Number(companyCount || 0);

  if (total <= 0 || count <= 0) {
    return [];
  }

  const minutesPerCompany = Math.floor(total / count);
  const remainingMinutes = total % count;

  return Array.from({ length: count }, (_, index) => {
    return minutesPerCompany + (index < remainingMinutes ? 1 : 0);
  });
}
function getShopMargin(o){const m=String(o.description||'').match(/\[MARZA_SKLEP:([^\]]+)\]/);return m?Number(String(m[1]).replace(',','.').replace(/[^0-9.-]/g,'')):Number(o.netAmount||0)}
function cleanShopDescription(o){return String(o.description||'').replace(/\s*\[MARZA_SKLEP:[^\]]+\]\s*/,'').trim()}
function has(user,key){return user.role==='ADMIN'||key==='missingReport'||user.permissions?.[key]}
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
 const [data,setData]=useState({companies:[],workEntries:[],extraOrders:[],absences:[],users:[]});
 const [summarySort,setSummarySort]=useState({
  key:'profit',
  direction:'desc'
});
 const [selectedCompany,setSelectedCompany]=useState(null);
 const [editUser,setEditUser]=useState(null);
 const [ai,setAi]=useState('');
 const [form,setForm]=useState({date:new Date().toISOString().slice(0,10),companyId:'',selectedCompanyIds:[],manualCompanyNames:[],newCompanyName:'',type:'dokumentacja',customType:'',title:'',description:'',time:'',travelTime:'',travelEnabled:false,billingMode:'MONTHLY',additionalCost:'',extraCostName:'',additionalCostDescription:'',orderNumber:'',netAmount:''});
 const [entriesDate,setEntriesDate]=useState(new Date().toISOString().slice(0,10));
 const [workCompanySearch,setWorkCompanySearch]=useState('');
 const [order,setOrder]=useState({date:new Date().toISOString().slice(0,10),companyId:'',newCompanyName:'',title:'',type:'inne',description:'',netAmount:'',travelCost:'',extraCost:'',extraCostDescription:'',time:'',orderNumber:'',status:'OPEN'});
 const [shopOrder,setShopOrder]=useState({date:new Date().toISOString().slice(0,10),companyId:'',newCompanyName:'',title:'',description:'',netAmount:'',margin:'',travelCost:'',extraCost:'',extraCostDescription:'',time:'',status:'OPEN'});
 const [training,setTraining]=useState({date:new Date().toISOString().slice(0,10),companyId:'',newCompanyName:'',time:'1:00',unitAmount:'109',peopleCount:'1',netAmount:'109',extraCostDescription:'',description:'',status:'DONE'});
 const [editingEntry,setEditingEntry]=useState(null);
 const [quickNotesOpen,setQuickNotesOpen]=useState(false);
 const [quickNotes,setQuickNotes]=useState([]);
 const [quickNoteContent,setQuickNoteContent]=useState('');
 const [quickNoteCompanyId,setQuickNoteCompanyId]=useState('');
 const [quickNoteNewCompanyName,setQuickNoteNewCompanyName]=useState('');
 const [quickNotesLoading,setQuickNotesLoading]=useState(false);
 const [quickNoteListening,setQuickNoteListening]=useState(false);
 const quickNoteRecognitionRef=useRef(null);
 const quickNoteSpeechBaseRef=useRef('');
 const myDayEntries=useMemo(()=>{
  const workEntries=(data.workEntries||[])
   .filter(entry=>entry.userId===user.id&&String(entry.date||'').slice(0,10)===entriesDate)
   .map(entry=>({...entry,entryKind:'WORK'}));

  const extraOrders=(data.extraOrders||[])
   .filter(entry=>entry.userId===user.id&&String(entry.date||'').slice(0,10)===entriesDate)
   .map(entry=>({...entry,entryKind:'EXTRA',travelMinutes:Number(entry.travelMinutes||0)}));

  return [...workEntries,...extraOrders]
   .sort((a,b)=>new Date(b.createdAt||b.date)-new Date(a.createdAt||a.date));
 },[data.workEntries,data.extraOrders,user.id,entriesDate]);

 const myDayTotalMinutes=useMemo(()=>{
  // Wpis grupowy tworzy osobny rekord dla każdej firmy, ale czas pracy
  // powinien zostać policzony tylko raz. Rekordy utworzone razem mają
  // te same dane i bardzo zbliżony czas utworzenia.
  const countedGroups=new Set();

  return myDayEntries.reduce((sum,entry)=>{
   const createdAt=new Date(entry.createdAt||entry.date).getTime();
   const createdBatch=Number.isFinite(createdAt)?Math.floor(createdAt/60000):0;
   const groupKey=[
    entry.userId||'',
    String(entry.date||'').slice(0,10),
    entry.type||'',
    entry.title||'',
    entry.description||'',
    Number(entry.minutes||0),
    Number(entry.travelMinutes||0),
    entry.orderNumber||'',
    createdBatch
   ].join('|');

   if(countedGroups.has(groupKey))return sum;
   countedGroups.add(groupKey);
   return sum+Number(entry.minutes||0)+Number(entry.travelMinutes||0);
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
  const workMinutes=entries.reduce((s,e)=>s+Number(e.minutes||0)+Number(e.travelMinutes||0),0);
  const normalOrderMinutes=normalOrders.reduce((s,o)=>s+Number(o.minutes||0)+Number(o.travelMinutes||0),0);
  const trainingMinutes=trainings.reduce((s,o)=>s+Number(o.minutes||0)+Number(o.travelMinutes||0),0);
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
 const adminKpis=useMemo(()=>{
  const rows=stats.rows||[];
  const totalProfit=rows.reduce((sum,row)=>sum+Number(row.profit||0),0);
  const totalCosts=rows.reduce((sum,row)=>sum+Number(row.costs||0)+Number(row.timeCost||0),0);
  const totalHours=Number(stats.totalMin||0)/60;
  const averageRate=totalHours>0?totalProfit/totalHours:0;
  const healthCounts=rows.reduce((counts,row)=>{
   const key=getCompanyHealth(row).key;
   counts[key]=(counts[key]||0)+1;
   return counts;
  },{});
  const pendingOrders=(data.extraOrders||[]).filter(order=>
   inSelectedMonth(order.date)&&!['INVOICED','PAID'].includes(String(order.status||'OPEN').toUpperCase())
  ).length;

  return {
   totalProfit,
   totalCosts,
   averageRate,
   profitable:Number(healthCounts.VERY_GOOD||0),
   watch:Number(healthCounts.WATCH||0),
   atRisk:Number(healthCounts.AT_RISK||0),
   unprofitable:Number(healthCounts.UNPROFITABLE||0),
   noData:Number(healthCounts.NO_DATA||0),
   pendingOrders
  };
 },[stats,data.extraOrders,selectedMonth]);
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
 function normalizeCompanyName(value){
  return String(value||'').toLocaleLowerCase('pl-PL').replace(/\s+/g,' ').trim();
 }
 function addManualCompanyToForm(){
  const name=String(form.newCompanyName||'').replace(/\s+/g,' ').trim();
  if(!name)return;

  const normalized=normalizeCompanyName(name);
  const existing=(data.companies||[]).find(c=>normalizeCompanyName(c.name)===normalized);
  if(existing){
   if(!(form.selectedCompanyIds||[]).includes(existing.id)){
    setForm({...form,selectedCompanyIds:[...(form.selectedCompanyIds||[]),existing.id],newCompanyName:''});
   }else{
    setForm({...form,newCompanyName:''});
   }
   return;
  }

  const manual=form.manualCompanyNames||[];
  if(manual.some(companyName=>normalizeCompanyName(companyName)===normalized)){
   setForm({...form,newCompanyName:''});
   return;
  }

  setForm({...form,manualCompanyNames:[...manual,name],newCompanyName:''});
 }
 async function addWork(){
 try{
  const description=String(form.description||'').trim();
  const minutes=parseTime(form.time);
  const pendingCompanyName=String(form.newCompanyName||'').replace(/\s+/g,' ').trim();
  const selectedIds=Array.from(new Set(form.selectedCompanyIds||[]));
  const manualCompanyNames=[...(form.manualCompanyNames||[])];
  if(pendingCompanyName&&!manualCompanyNames.some(name=>normalizeCompanyName(name)===normalizeCompanyName(pendingCompanyName))){
   manualCompanyNames.push(pendingCompanyName);
  }
  const customType=String(form.customType||'').trim();
  const resolvedType=form.type==='własna czynność'?customType:form.type;
  const extraCost=Number(form.additionalCost||0);
  const netAmount=Number(form.netAmount||0);
  const travelMinutes=form.travelEnabled?parseTime(form.travelTime):0;

  if(!form.date)return alert('Wybierz datę.');
  if(selectedIds.length===0&&manualCompanyNames.length===0)return alert('Wybierz przynajmniej jedną firmę albo wpisz nową firmę.');
  if(!resolvedType)return alert('Wybierz czynność albo wpisz nazwę własnej czynności.');
  if(!description)return alert('Wpisz krótki opis wykonywanych prac.');
  if(minutes<=0)return alert('Wpisz prawidłowy czas pracy.');
  if(form.travelEnabled&&travelMinutes<=0)return alert('Wpisz prawidłowy czas dojazdu.');

  const duplicatedManual=manualCompanyNames.find(name=>
   (data.companies||[]).some(c=>normalizeCompanyName(c.name)===normalizeCompanyName(name))
  );
  if(duplicatedManual)return alert(`Firma „${duplicatedManual}” już istnieje w bazie. Wybierz ją z listy.`);

  if(form.billingMode==='ONE_TIME'){
   if(netAmount<=0)return alert('Wpisz kwotę netto za zlecenie większą od zera.');
   if(extraCost>0&&!String(form.extraCostName||'').trim())return alert('Wpisz nazwę dodatkowego kosztu.');
  }

  const companyIds=[...selectedIds];
  for(const companyName of manualCompanyNames){
   const created=await jsonFetch('/api/companies',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
     name:companyName,
     status:'ACTIVE',
     billingType:form.billingMode==='ONE_TIME'?'ONE_TIME':'MONTHLY',
     netAmount:0,
     travelCost:0,
     extraCost:0
    })
   });
   companyIds.push(created.id);
  }

  const dividedMinutes=splitMinutesBetweenCompanies(minutes,companyIds.length);
  const dividedTravelMinutes=splitMinutesBetweenCompanies(travelMinutes,companyIds.length);

  if(form.billingMode==='MONTHLY'){
   await Promise.all(companyIds.map((companyId,index)=>jsonFetch('/api/work',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
     date:form.date,
     companyId,
     orderNumber:form.orderNumber||null,
     type:resolvedType,
     title:description,
     description,
     minutes:dividedMinutes[index],
     travelMinutes:dividedTravelMinutes[index],
     additionalCost:0,
     additionalCostDescription:null
    })
   })));
  }else{
   const costDescription=String(form.extraCostName||'').trim()||null;

   await Promise.all(companyIds.map((companyId,index)=>jsonFetch('/api/extra-orders',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
     companyId,
     date:form.date,
     title:description,
     type:resolvedType,
     description,
     netAmount,
     travelCost:0,
     travelMinutes:dividedTravelMinutes[index],
     extraCost,
     extraCostDescription:costDescription,
     minutes:dividedMinutes[index],
     orderNumber:form.orderNumber||null,
     status:'DONE'
    })
   })));
  }

  setForm({
   date:new Date().toISOString().slice(0,10),
   companyId:'',
   selectedCompanyIds:[],
   manualCompanyNames:[],
   newCompanyName:'',
   type:'dokumentacja',
   customType:'',
   title:'',
   description:'',
   time:'',
   travelTime:'',
   travelEnabled:false,
   billingMode:'MONTHLY',
   additionalCost:'',
   extraCostName:'',
   additionalCostDescription:'',
   orderNumber:'',
   netAmount:''
  });
  setWorkCompanySearch('');
  await load();
  alert(companyIds.length>1?`Zapisano wpisy dla ${companyIds.length} firm. Łączny czas został podzielony pomiędzy firmy.`:'Wpis został zapisany.');
 }catch(err){
  alert(err.message);
 }
}
 function startEditEntry(entry){
 setEditingEntry(entry);

 setForm({
  date:String(entry.date||'').slice(0,10),
  companyId:entry.companyId||'',
  selectedCompanyIds:[],
  manualCompanyNames:[],
  newCompanyName:'',
  type:entry.type||'inne',
  customType:'',
  title:entry.title||'',
  description:entry.description||entry.title||'',
  time:minutesToInput(entry.minutes),
  travelTime:minutesToInput(entry.travelMinutes),
  travelEnabled:Number(entry.travelMinutes||0)>0,
  billingMode:entry.entryKind==='EXTRA'?'ONE_TIME':'MONTHLY',
  additionalCost:entry.entryKind==='EXTRA'?String(entry.extraCost||''):String(entry.additionalCost||''),
  extraCostName:entry.entryKind==='EXTRA'?(entry.extraCostDescription||''):'',
  additionalCostDescription:entry.entryKind==='WORK'?(entry.additionalCostDescription||''):'',
  orderNumber:entry.orderNumber||'',
  netAmount:entry.entryKind==='EXTRA'?String(entry.netAmount||''):''
 });

 window.scrollTo({top:0,behavior:'smooth'});
}

function cancelEditEntry(){
 setEditingEntry(null);
 setForm({
  date:new Date().toISOString().slice(0,10),companyId:'',selectedCompanyIds:[],manualCompanyNames:[],newCompanyName:'',
  type:'dokumentacja',customType:'',title:'',description:'',time:'',travelTime:'',travelEnabled:false,billingMode:'MONTHLY',
  additionalCost:'',extraCostName:'',additionalCostDescription:'',orderNumber:'',netAmount:''
 });
}

async function saveEditedEntry(){
 if(!editingEntry)return;
 try{
  if(!form.companyId)return alert('Wybierz firmę.');
  const minutes=parseTime(form.time);
  const travelMinutes=form.travelEnabled?parseTime(form.travelTime):0;
  if(minutes<=0)return alert('Wpisz prawidłowy czas pracy.');
  if(form.travelEnabled&&travelMinutes<=0)return alert('Wpisz prawidłowy czas dojazdu.');

  const common={
   date:form.date,companyId:form.companyId,orderNumber:form.orderNumber||null,type:form.type||'inne',
   title:form.description?.trim()||form.type||'Wpis pracy',description:form.description||null,
   minutes,travelMinutes
  };

  if(editingEntry.entryKind==='EXTRA'){
   await jsonFetch('/api/extra-orders/'+editingEntry.id,{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
     ...common,netAmount:Number(form.netAmount||0),travelCost:0,extraCost:Number(form.additionalCost||0),
     extraCostDescription:String(form.extraCostName||'').trim()||null,status:editingEntry.status||'DONE'
    })
   });
  }else{
   await jsonFetch('/api/work/'+editingEntry.id,{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
     ...common,additionalCost:Number(form.additionalCost||0),additionalCostDescription:form.additionalCostDescription||null
    })
   });
  }

  setEditingEntry(null);
  setForm({
   date:form.date,companyId:'',selectedCompanyIds:[],manualCompanyNames:[],newCompanyName:'',type:'dokumentacja',customType:'',
   title:'',description:'',time:'',travelTime:'',travelEnabled:false,billingMode:'MONTHLY',additionalCost:'',extraCostName:'',
   additionalCostDescription:'',orderNumber:'',netAmount:''
  });
  await load();
  alert('Wpis został zaktualizowany.');
 }catch(err){alert(err.message);}
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

  if(editingEntry?.id===entry.id){
   cancelEditEntry();
  }

  await load();

  alert('Wpis został usunięty.');
 }catch(err){
  alert(err.message);
 }
}
 function toggleQuickNoteVoice(){
  if(quickNoteListening){
   quickNoteRecognitionRef.current?.stop();
   return;
  }

  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;

  if(!SpeechRecognition){
   alert('Ta przeglądarka nie obsługuje rozpoznawania mowy. Spróbuj użyć Chrome albo Safari z włączonym dostępem do mikrofonu.');
   return;
  }

  const recognition=new SpeechRecognition();
  recognition.lang='pl-PL';
  recognition.continuous=true;
  recognition.interimResults=true;
  recognition.maxAlternatives=1;

  quickNoteSpeechBaseRef.current=String(quickNoteContent||'').trim();
  quickNoteRecognitionRef.current=recognition;

  recognition.onstart=()=>setQuickNoteListening(true);

  recognition.onresult=event=>{
   let finalText='';
   let interimText='';

   for(let i=0;i<event.results.length;i++){
    const transcript=event.results[i][0]?.transcript||'';
    if(event.results[i].isFinal)finalText+=transcript+' ';
    else interimText+=transcript;
   }

   const base=quickNoteSpeechBaseRef.current;
   const spoken=(finalText+interimText).trim();
   setQuickNoteContent([base,spoken].filter(Boolean).join(base&&spoken?' ':'').trim());
  };

  recognition.onerror=event=>{
   console.error('Błąd rozpoznawania mowy:',event.error);
   setQuickNoteListening(false);

   if(event.error==='not-allowed'||event.error==='service-not-allowed'){
    alert('Brak dostępu do mikrofonu. Zezwól aplikacji na używanie mikrofonu w ustawieniach przeglądarki.');
   }else if(event.error!=='aborted'&&event.error!=='no-speech'){
    alert('Nie udało się rozpoznać mowy. Spróbuj ponownie.');
   }
  };

  recognition.onend=()=>{
   setQuickNoteListening(false);
   quickNoteRecognitionRef.current=null;
  };

  try{
   recognition.start();
  }catch(err){
   console.error(err);
   setQuickNoteListening(false);
  }
 }

 async function addQuickNote(){
 const content=String(quickNoteContent||'').trim();
 const newCompanyName=String(quickNoteNewCompanyName||'').trim();
 const normalizedNewCompany=newCompanyName.toLocaleLowerCase('pl-PL').replace(/\s+/g,' ').trim();

 if(!content){
  return alert('Wpisz treść notatki.');
 }

 try{
  let companyId=quickNoteCompanyId||form.companyId||null;

  if(newCompanyName){
    const duplicate=(data.companies||[]).find(company=>
    String(company.name||'').toLocaleLowerCase('pl-PL').replace(/\s+/g,' ').trim()===normalizedNewCompany
   );

   if(duplicate){
    return alert('Firma już istnieje w bazie. Wybierz ją z listy.');
   }

   const created=await jsonFetch('/api/companies',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
     name:newCompanyName,
     status:'ACTIVE',
     billingType:'MONTHLY',
     netAmount:0,
     travelCost:0,
     extraCost:0
    })
   });

   companyId=created.id;
  }

  await jsonFetch('/api/quick-notes',{
   method:'POST',
   headers:{
    'Content-Type':'application/json'
   },
   body:JSON.stringify({
    content,
    companyId
   })
  });

  setQuickNoteContent('');
  setQuickNoteCompanyId('');
  setQuickNoteNewCompanyName('');

  await Promise.all([loadQuickNotes(),load()]);
 }catch(err){
  alert(err.message);
 }
}
 function moveQuickNoteToWork(note){
 setEditingWorkEntry(null);

 const noteCompanyId=note.companyId||note.company?.id||'';

 setForm({
  date:new Date().toISOString().slice(0,10),
  companyId:noteCompanyId,
  selectedCompanyIds:noteCompanyId?[noteCompanyId]:[],
  manualCompanyNames:[],
  newCompanyName:'',
  type:'inne',
  customType:'',
  title:note.content||'',
  description:note.content||'',
  time:'',
  travelTime:'',
  billingMode:'MONTHLY',
  additionalCost:'',
  extraCostName:'',
  additionalCostDescription:'',
  orderNumber:'',
  netAmount:''
 });

 setTab('work');
 setQuickNotesOpen(false);

 window.scrollTo({
  top:0,
  behavior:'smooth'
 });
}

async function deleteQuickNote(note){
 if(!note)return;

 if(!confirm('Czy na pewno usunąć tę notatkę?')){
  return;
 }

 try{
  await jsonFetch('/api/quick-notes/'+note.id,{
   method:'DELETE'
  });

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
 const pendingAbsenceCount=(data.absences||[]).filter(a=>a.status==='PENDING').length;
 return <div className="app"><aside className="sidebar"><div style={{textAlign:'right'}}>«</div><div className="side-title">Nawigacja</div><div className="userline">Użytkownik: <b>{user.name}</b></div><div className="userline">Rola: <b>{user.role==='ADMIN'?'Administrator':'Pracownik'}</b></div>{modules.map(([key,label])=>has(user,key)&&!(user.role==='WORKER'&&key==='extraOrders')&&!(user.role==='ADMIN'&&key==='missingReport')&&<button key={key} className={'navbtn '+(tab===key?'active':'')} onClick={()=>{setTab(key);setEditUser(null)}}>{label}{user.role==='ADMIN'&&key==='workerStats'&&pendingAbsenceCount>0?` (${pendingAbsenceCount})`:''}</button>)}<a href="/logout" className="navbtn">Wyloguj</a></aside><main className="main"><header className="top"><img src="/logo_white.png" className="logo" alt="Safety Service"/><div className="title">SAFETY SERVICE — PANEL ROZLICZEŃ</div><a className="btn" href="/logout">Wyloguj</a></header><div className="content">
 {tab==='dashboard'&&<>
  {pendingAbsenceCount>0&&<div className="panel" style={{paddingBottom:0}}><div className="card" style={{background:'#fff6df',borderLeft:'5px solid #e5a100',marginBottom:0}}><div className="row between"><div><b>🔔 Nowe zgłoszenia nieobecności: {pendingAbsenceCount}</b><div className="muted" style={{marginTop:4}}>Zgłoszenia oczekują na akceptację lub odrzucenie.</div></div><button className="orange" type="button" onClick={()=>setTab('workerStats')}>Przejdź do zgłoszeń</button></div></div></div>}
  <AdminOverview
   rows={stats.rows}
   data={data}
   selectedMonth={selectedMonth}
   setSelectedMonth={setSelectedMonth}
   adminKpis={adminKpis}
  />
</>}
 {tab==='clients'&&<div className="panel"><div className="grid"><form className="card" onSubmit={saveCompany}><h2>Dodaj firmę</h2><input name="name" placeholder="Nazwa firmy" required/><input name="nip" placeholder="NIP" onBlur={e=>autofillByNip(e.currentTarget.form)}/><input name="address" placeholder="Adres"/><input name="contactPerson" placeholder="Osoba kontaktowa"/><input name="phone" placeholder="Telefon"/><input name="email" placeholder="Email"/><input name="serviceType" placeholder="Typ obsługi"/><select name="assignedUserId"><option value="">Przypisz pracownika</option>{data.users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select><select name="status"><option value="ACTIVE">aktywna</option><option value="PAUSED">zawieszona</option><option value="INACTIVE">nieaktywna</option></select><select name="billingType"><option value="MONTHLY">miesięczne</option><option value="ONE_TIME">jednorazowe</option><option value="HOURLY">godzinowe</option></select><input name="netAmount" type="number" placeholder="Kwota netto miesięcznie"/><input name="travelCost" type="number" placeholder="Koszt dojazdów"/><input name="extraCost" type="number" placeholder="Dodatkowe koszty"/><input name="extraCostDescription" placeholder="Opis dodatkowych kosztów / uwagi"/><input name="latitude" type="number" step="any" placeholder="Szerokość geograficzna, np. 50.033"/><input name="longitude" type="number" step="any" placeholder="Długość geograficzna, np. 20.217"/><button className="orange">Zapisz</button></form><div className="card"><h2>Baza firm</h2><div className="filterBar"><input placeholder="Szukaj firmy..." value={companySearch} onChange={e=>setCompanySearch(e.target.value)}/><select value={companySort} onChange={e=>setCompanySort(e.target.value)}><option value="name_asc">Nazwa A-Z</option><option value="name_desc">Nazwa Z-A</option><option value="money_desc">Największa kwota</option><option value="money_asc">Najmniejsza kwota</option></select><select value={companyStatus} onChange={e=>setCompanyStatus(e.target.value)}><option value="ALL">Wszystkie statusy</option><option value="ACTIVE">Aktywne</option><option value="PAUSED">Zawieszone</option><option value="INACTIVE">Nieaktywne</option></select></div><div className="muted">Widoczne firmy: {filteredCompanies.length} / {data.companies.length}</div><div className="tableWrap"><table><thead><tr><th>Status</th><th>Firma</th><th>NIP</th><th>Pracownik</th><th>Kwota miesięczna</th><th>Uwagi</th><th>Akcje</th></tr></thead><tbody>{filteredCompanies.map(c=><tr className="clickable" key={c.id} onClick={()=>setSelectedCompany(c)}><td><span className={'status '+c.status}></span></td><td>{c.name}</td><td>{c.nip||'-'}</td><td>{c.assignedUser?.name||'-'}</td><td>{money(c.netAmount)}</td><td>{c.extraCostDescription||'-'}</td><td><button type="button" className="light iconBtn" onClick={(e)=>{e.stopPropagation();setSelectedCompany(c)}}>✏️</button><button type="button" className="light iconBtn" onClick={(e)=>{e.stopPropagation();deleteCompany(c)}}>🗑️</button></td></tr>)}</tbody></table></div>{selectedCompany&&<CompanyDetails key={selectedCompany.id} company={selectedCompany} users={data.users} orders={data.extraOrders.filter(o=>o.companyId===selectedCompany.id)} onSubmit={updateCompany} onDelete={()=>deleteCompany(selectedCompany)}/>}</div></div></div>}
 {tab==='employees'&&<div className="panel"><h1>Baza pracowników</h1><div className="employeeGrid">{data.users.map(u=><EmployeeCard key={u.id} u={u} onEdit={()=>{setTab('users');setEditUser(u)}} onDelete={()=>deleteUser(u)}/>)}</div></div>}
 {tab==='workerStats'&&<WorkerStatsPanel data={data} reload={load}/>}
  {tab==='work'&&
  <div className="panel">
   <div className="card" style={{maxWidth:900}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,marginBottom:8}}>
     <h1 style={{margin:0}}>Panel pracownika</h1>
     <button
      type="button"
      onClick={()=>setQuickNotesOpen(true)}
      aria-label="Otwórz szybkie notatki"
      title="Szybkie notatki"
      style={{
       width:58,
       height:58,
       flex:'0 0 auto',
       borderRadius:'50%',
       border:'none',
       background:'#ff5a14',
       color:'#fff',
       fontSize:25,
       cursor:'pointer',
       boxShadow:'0 8px 24px rgba(0,0,0,0.20)'
      }}
     >
      📝
     </button>
    </div>

    {editingEntry&&
     <div className="warnBox" style={{marginBottom:16}}>
      Edytujesz istniejący wpis. Po wprowadzeniu zmian kliknij „Zapisz zmiany”.
     </div>
    }

    <div style={{display:'grid',gap:16}}>
     <Field label="1. Data">
      <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
     </Field>

     {!editingEntry&&<Field label="2. Wybór firmy lub kilku firm">
      <div>
       <input
        placeholder="Szukaj firmy..."
        value={workCompanySearch}
        onChange={e=>setWorkCompanySearch(e.target.value)}
       />
       {(form.selectedCompanyIds||[]).length>0&&
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10,marginBottom:8}}>
         {(form.selectedCompanyIds||[]).map(companyId=>{
          const selectedCompany=data.companies.find(c=>c.id===companyId);
          if(!selectedCompany)return null;

          return <span key={companyId} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'7px 10px',border:'1px solid #cbd8e5',borderRadius:999,background:'#f5f8fb',fontWeight:700}}>
           {selectedCompany.name}
           <button
            type="button"
            aria-label={`Usuń firmę ${selectedCompany.name}`}
            onClick={()=>setForm({...form,selectedCompanyIds:(form.selectedCompanyIds||[]).filter(id=>id!==companyId)})}
            style={{border:0,background:'transparent',padding:0,cursor:'pointer',fontSize:16,lineHeight:1}}
           >×</button>
          </span>
         })}
        </div>
       }
       <div style={{border:'1px solid #d8e0e8',borderRadius:10,maxHeight:210,overflowY:'auto',padding:10,marginTop:8}}>
        {data.companies
         .filter(c=>c.status!=='INACTIVE')
         .filter(c=>String(c.name||'').toLowerCase().includes(workCompanySearch.toLowerCase()))
         .map(c=>{
          const checked=(form.selectedCompanyIds||[]).includes(c.id);
          return <label key={c.id} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 4px',cursor:'pointer'}}>
           <input
            type="checkbox"
            checked={checked}
            onChange={e=>setForm({...form,selectedCompanyIds:e.target.checked?[...(form.selectedCompanyIds||[]),c.id]:(form.selectedCompanyIds||[]).filter(id=>id!==c.id)})}
            style={{width:'auto'}}
           />
           <span>{c.name}</span>
          </label>
         })}
        {data.companies.filter(c=>c.status!=='INACTIVE').filter(c=>String(c.name||'').toLowerCase().includes(workCompanySearch.toLowerCase())).length===0&&
         <div className="muted">Brak firm spełniających kryteria.</div>
        }
       </div>
      </div>
     </Field>}

     {editingEntry&&<Field label="2. Firma">
      <select value={form.companyId} onChange={e=>setForm({...form,companyId:e.target.value})}>
       <option value="">Wybierz firmę</option>
       {data.companies.filter(c=>c.status!=='INACTIVE').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
     </Field>}

     {!editingEntry&&<Field label="3. Wpisz firmę ręcznie, jeżeli nie ma jej na liście">
      <div>
       <input
        placeholder="Nazwa nowej firmy — zatwierdź Enterem"
        value={form.newCompanyName}
        onChange={e=>setForm({...form,newCompanyName:e.target.value})}
        onKeyDown={e=>{
         if(e.key==='Enter'){
          e.preventDefault();
          addManualCompanyToForm();
         }
        }}
        onBlur={()=>{
         if(String(form.newCompanyName||'').trim())addManualCompanyToForm();
        }}
       />
       {(form.manualCompanyNames||[]).length>0&&
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
         {(form.manualCompanyNames||[]).map(companyName=><span key={companyName} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'7px 10px',border:'1px solid #cbd8e5',borderRadius:999,background:'#f5f8fb',fontWeight:700}}>
          {companyName}
          <button
           type="button"
           aria-label={`Usuń firmę ${companyName}`}
           onClick={()=>setForm({...form,manualCompanyNames:(form.manualCompanyNames||[]).filter(name=>name!==companyName)})}
           style={{border:0,background:'transparent',padding:0,cursor:'pointer',fontSize:16,lineHeight:1}}
          >×</button>
         </span>)}
        </div>
       }
      </div>
     </Field>}

     <Field label="4. Numer zlecenia / PO">
      <input placeholder="opcjonalnie" value={form.orderNumber} onChange={e=>setForm({...form,orderNumber:e.target.value})}/>
     </Field>

     <Field label="5. Wybór czynności">
      <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
       <option value="szkolenie">Szkolenie</option>
       <option value="audyt">Audyt</option>
       <option value="konsultacje">Konsultacje</option>
       <option value="inne">Inne</option>
       <option value="własna czynność">Własna czynność</option>
      </select>
     </Field>

     {form.type==='własna czynność'&&<Field label="Nazwa własnej czynności">
      <input placeholder="Wpisz nazwę czynności" value={form.customType||''} onChange={e=>setForm({...form,customType:e.target.value})}/>
     </Field>}

     <Field label="6. Krótki opis wykonywanych prac">
      <textarea placeholder="Krótko opisz wykonane prace" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
     </Field>

     <Field label="7. Czas pracy">
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}>
       <input placeholder="np. 2:30, 2h 30m, 150m" value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/>
       <label style={{display:'flex',alignItems:'center',gap:8,fontWeight:700,whiteSpace:'nowrap',cursor:'pointer'}}>
        <input type="checkbox" checked={!!form.travelEnabled} onChange={e=>setForm({...form,travelEnabled:e.target.checked,travelTime:e.target.checked?form.travelTime:''})} style={{width:'auto'}}/>
        ✅ Dojazd
       </label>
      </div>
      {form.travelEnabled&&<div style={{marginTop:10}}>
       <input placeholder="Czas dojazdu, np. 0:45, 45m" value={form.travelTime} onChange={e=>setForm({...form,travelTime:e.target.value})}/>
      </div>}
     </Field>

     {!editingEntry&&<div className="card" style={{margin:0,padding:18}}>
      <h2 style={{marginTop:0}}>8. Typ rozliczenia</h2>
      <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
       <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
        <input type="radio" name="billingMode" checked={form.billingMode==='MONTHLY'} onChange={()=>setForm({...form,billingMode:'MONTHLY',netAmount:'',additionalCost:'',extraCostName:'',additionalCostDescription:''})} style={{width:'auto'}}/>
        Obsługa miesięczna
       </label>
       <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
        <input type="radio" name="billingMode" checked={form.billingMode==='ONE_TIME'} onChange={()=>setForm({...form,billingMode:'ONE_TIME'})} style={{width:'auto'}}/>
        Kwota netto za zlecenie
       </label>
      </div>
     </div>}

     {(!editingEntry||editingEntry.entryKind==='EXTRA')&&form.billingMode==='ONE_TIME'&&<>
      <Field label="9. Kwota netto za zlecenie">
       <input type="number" min="0" step="0.01" placeholder="np. 1500" value={form.netAmount} onChange={e=>setForm({...form,netAmount:e.target.value})}/>
      </Field>
      <Field label="Kwota netto dodatkowego kosztu">
       <input type="number" min="0" step="0.01" placeholder="np. 500" value={form.additionalCost} onChange={e=>setForm({...form,additionalCost:e.target.value})}/>
      </Field>
      <Field label="10. Nazwa dodatkowego kosztu">
       <input placeholder="np. ratownik medyczny" value={form.extraCostName||''} onChange={e=>setForm({...form,extraCostName:e.target.value})}/>
      </Field>
     </>}

     {!editingEntry&&<button type="button" className="orange" onClick={addWork}>
      Dodaj wpis
     </button>}

     {editingEntry&&<div className="row" style={{marginTop:12}}>
      <button type="button" className="orange" onClick={saveEditedEntry}>Zapisz zmiany</button>
      <button type="button" className="light" onClick={cancelEditEntry}>Anuluj edycję</button>
     </div>}
    </div>
   </div>

   <div className="card" style={{maxWidth:1000,marginTop:20}}>
    <div className="row between">
     <div>
      <h2 style={{marginBottom:8}}>Moje wpisy z wybranego dnia</h2>
      <label style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',fontWeight:700}}>
       Wybierz datę:
       <input
        type="date"
        value={entriesDate}
        onChange={e=>setEntriesDate(e.target.value)}
        style={{maxWidth:190,margin:0}}
       />
      </label>
     </div>
     <div style={{textAlign:'right'}}><b>Łączny czas</b><h2 style={{margin:0}}>{minToText(myDayTotalMinutes)}</h2></div>
    </div>
    {myDayEntries.length===0&&<p className="muted" style={{marginTop:20}}>Nie masz jeszcze żadnych wpisów z tego dnia.</p>}
    {myDayEntries.length>0&&<div className="tableWrap" style={{marginTop:20}}><table><thead><tr><th>Firma</th><th>Rodzaj pracy</th><th>Opis</th><th>Czas pracy</th><th>Dojazd</th><th>Numer zlecenia</th><th>Akcje</th></tr></thead><tbody>
     {myDayEntries.map(entry=><tr key={`${entry.entryKind}-${entry.id}`}><td>{workEntryCompanyName(entry)}</td><td>{entry.entryKind==='EXTRA'?<><span className="pill">Zlecenie dodatkowe</span><br/>{entry.type||'-'}</>:entry.type||'-'}</td><td style={{maxWidth:420,whiteSpace:'normal',wordBreak:'break-word'}}>{entry.description||entry.title||'-'}</td><td>{minToText(Number(entry.minutes||0))}</td><td>{Number(entry.travelMinutes||0)>0?minToText(Number(entry.travelMinutes||0)):'-'}</td><td>{entry.orderNumber||'-'}</td><td><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="light" onClick={()=>startEditEntry(entry)}>Edytuj</button><button type="button" className="red" onClick={()=>entry.entryKind==='EXTRA'?deleteExtraOrder(entry):deleteWorkEntry(entry)}>Usuń</button></div></td></tr>)}
    </tbody></table></div>}
   </div>
   <WorkerMissingAlert data={data} user={user} onOpen={()=>setTab('missingReport')}/>
  </div>
 }
 {tab==='missingReport'&&<MissingReportPanel data={data} user={user} reload={load}/>}
 {tab==='extraOrders'&&<ExtraOrdersPanel data={data} order={order} setOrder={setOrder} addExtraOrder={addExtraOrder} deleteExtraOrder={deleteExtraOrder}/>} 
 {tab==='shopOrders'&&<ShopOrdersPanel data={data} shopOrder={shopOrder} setShopOrder={setShopOrder} addShopOrder={addShopOrder} deleteExtraOrder={deleteExtraOrder}/>} 
{tab==='ai'&&<div className="panel">
  <h1>AI analiza rentowności i mapa firm</h1>
  <CompanyMap
   companies={data.companies}
   rows={stats.rows.map(row=>({...row,health:getCompanyHealth(row)}))}
   onOpenCompany={companyId=>{
    const company=data.companies.find(item=>item.id===companyId);
    if(company){
     setSelectedCompany(company);
     setTab('clients');
     setTimeout(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}),100);
    }
   }}
  />
  <div className="card" style={{marginTop:20}}>
   <h2>Analiza AI</h2>
   <button className="orange" onClick={runAi}>Uruchom AI analizę</button>
   <p style={{whiteSpace:'pre-wrap'}}>{ai||'AI obliczy rentowność każdego klienta i poda konkretne podpowiedzi. Uwzględnia obsługę miesięczną, zlecenia dodatkowe, dojazdy, koszty dodatkowe i koszt czasu pracy.'}</p>
  </div>
 </div>}
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

    <div style={{display:'flex',gap:8,alignItems:'center',marginTop:8,marginBottom:8}}>
     <button
      type="button"
      className={quickNoteListening?'red':'light'}
      onClick={toggleQuickNoteVoice}
     >
      {quickNoteListening?'⏹ Zatrzymaj nagrywanie':'🎤 Nagraj notatkę'}
     </button>

     {quickNoteListening&&
      <span style={{fontWeight:700,color:'#d23b3b'}}>
       Słucham…
      </span>
     }
    </div>

    <label style={{display:'block',fontWeight:700,marginTop:8,marginBottom:5}}>Firma z listy (opcjonalnie)</label>
    <select
     value={quickNoteCompanyId}
     onChange={e=>{
      setQuickNoteCompanyId(e.target.value);
      if(e.target.value)setQuickNoteNewCompanyName('');
     }}
    >
     <option value="">Wybierz firmę opcjonalnie</option>

     {data.companies
      .filter(c=>c.status!=='INACTIVE')
      .map(c=>
       <option key={c.id} value={c.id}>
        {c.name}
       </option>
      )}
    </select>

    <label style={{display:'block',fontWeight:700,marginTop:10,marginBottom:5}}>Firma spoza listy (opcjonalnie)</label>
    <input
     type="text"
     placeholder="Wpisz nazwę nowej firmy"
     value={quickNoteNewCompanyName}
     onChange={e=>{
      setQuickNoteNewCompanyName(e.target.value);
      if(e.target.value)setQuickNoteCompanyId('');
     }}
     onKeyDown={e=>{
      if(e.key==='Enter'){
       e.preventDefault();
       addQuickNote();
      }
     }}
    />

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
      <div
 style={{
  display:'flex',
  gap:'8px',
  flexWrap:'wrap',
  marginTop:'12px'
 }}
>
 <button
  type="button"
  className="orange"
  onClick={()=>moveQuickNoteToWork(note)}
 >
  Przenieś do wpisu
 </button>

 <button
  type="button"
  className="red"
  onClick={()=>deleteQuickNote(note)}
 >
  Usuń
 </button>
</div>
     </div>
    )}
   </div>
  </div>
 }

 </main>
 </div>
}



function previousMonthValue(month){
 const [year,monthNumber]=String(month||'').split('-').map(Number);
 const date=new Date(year,monthNumber-2,1);
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

function calculateRowsForMonth(data,month){
 const rows=(data.companies||[]).map(c=>{
  const entries=(data.workEntries||[]).filter(w=>w.companyId===c.id&&String(w.date||'').slice(0,7)===month);
  const orders=(data.extraOrders||[]).filter(o=>o.companyId===c.id&&String(o.date||'').slice(0,7)===month);
  const trainings=orders.filter(o=>String(o.type||'').toLowerCase()==='szkolenie wstępne');
  const normalOrders=orders.filter(o=>String(o.type||'').toLowerCase()!=='szkolenie wstępne');
  const shopOrders=normalOrders.filter(o=>String(o.type||'').toLowerCase()==='zlecenie sklep');
  const regularOrders=normalOrders.filter(o=>String(o.type||'').toLowerCase()!=='zlecenie sklep');
  const workMinutes=entries.reduce((sum,row)=>sum+Number(row.minutes||0),0);
  const orderMinutes=normalOrders.reduce((sum,row)=>sum+Number(row.minutes||0),0);
  const trainingMinutes=trainings.reduce((sum,row)=>sum+Number(row.minutes||0),0);
  const minutes=workMinutes+orderMinutes+trainingMinutes;
  const netMonthly=Number(c.netAmount||0);
  const monthly=netMonthly>0||String(c.billingType||'').toUpperCase()==='MONTHLY';
  const netOrders=regularOrders.reduce((sum,row)=>sum+Number(row.netAmount||0),0)+shopOrders.reduce((sum,row)=>sum+getShopMargin(row),0);
  const trainingAmount=trainings.reduce((sum,row)=>sum+Number(row.netAmount||0),0);
  const netTotal=netMonthly+netOrders+(monthly?0:trainingAmount);
  const costs=Number(c.travelCost||0)+Number(c.extraCost||0)+entries.reduce((sum,row)=>sum+Number(row.additionalCost||0),0)+normalOrders.reduce((sum,row)=>sum+Number(row.travelCost||0)+Number(row.extraCost||0),0);
  const timeCost=(workMinutes/60)*150+(orderMinutes/60)*250+(trainingMinutes/60)*(monthly?150:0);
  const profit=netTotal-costs-timeCost;
  const rate=minutes?profit/(minutes/60):0;
  const activities=[...entries,...orders].map(row=>row.createdAt||row.date).filter(Boolean).sort((a,b)=>new Date(b)-new Date(a));
  return {...c,entries,orders,minutes,netMonthly,netOrders,netTotal,costs,timeCost,profit,rate,hours:minutes/60,lastActivity:activities[0]||null,orderCount:normalOrders.length};
 });
 const grouped=new Map();
 rows.forEach(row=>{
  const key=String(row.name||'').trim().toLowerCase();
  if(!grouped.has(key)){grouped.set(key,{...row});return;}
  const target=grouped.get(key);
  ['minutes','netMonthly','netOrders','netTotal','costs','timeCost','profit','orderCount'].forEach(field=>target[field]=Number(target[field]||0)+Number(row[field]||0));
  target.entries=[...(target.entries||[]),...(row.entries||[])];
  target.orders=[...(target.orders||[]),...(row.orders||[])];
  target.rate=target.minutes?target.profit/(target.minutes/60):0;
  if(row.lastActivity&&(!target.lastActivity||new Date(row.lastActivity)>new Date(target.lastActivity)))target.lastActivity=row.lastActivity;
 });
 return [...grouped.values()];
}

function percentChange(current,previous){
 const c=Number(current||0),p=Number(previous||0);
 if(!p)return c?100:0;
 return ((c-p)/Math.abs(p))*100;
}

function AdminOverview({rows,data,selectedMonth,setSelectedMonth,adminKpis}){
 const [healthFilter,setHealthFilter]=useState('ALL');
 const [workerFilter,setWorkerFilter]=useState('ALL');
 const [billingFilter,setBillingFilter]=useState('ALL');
 const [search,setSearch]=useState('');
 const [selectedDetail,setSelectedDetail]=useState(null);

 function applyHealthFilter(filter){
  setHealthFilter(filter);
  setTimeout(()=>{
   document.getElementById('admin-company-table')?.scrollIntoView({behavior:'smooth',block:'start'});
  },50);
 }

 const healthFilterLabels={
  VERY_GOOD:'Bardzo dobre',
  WATCH:'Do obserwacji',
  AT_RISK:'Zagrożone',
  UNPROFITABLE:'Nierentowne',
  NO_DATA:'Bez danych'
 };
 const previousMonth=previousMonthValue(selectedMonth);
 const previousRows=useMemo(()=>calculateRowsForMonth(data,previousMonth),[data,previousMonth]);
 const previousMap=useMemo(()=>new Map(previousRows.map(row=>[String(row.name||'').toLowerCase(),row])),[previousRows]);
 const totalPrevious=useMemo(()=>previousRows.reduce((sum,row)=>sum+Number(row.profit||0),0),[previousRows]);
 const incomePrevious=useMemo(()=>previousRows.reduce((sum,row)=>sum+Number(row.netTotal||0),0),[previousRows]);
 const minutesPrevious=useMemo(()=>previousRows.reduce((sum,row)=>sum+Number(row.minutes||0),0),[previousRows]);
 const ratePrevious=minutesPrevious?totalPrevious/(minutesPrevious/60):0;

 const alerts=useMemo(()=>{
  const list=[];
  rows.forEach(row=>{
   const health=getCompanyHealth(row);
   if(health.key==='UNPROFITABLE')list.push({level:'danger',text:`${row.name}: strata ${money(Math.abs(row.profit))}.`});
   else if(health.key==='AT_RISK')list.push({level:'warning',text:`${row.name}: stawka efektywna tylko ${Number(row.rate||0).toFixed(2)} zł/h.`});
   if(Number(row.minutes||0)>=2400&&Number(row.netMonthly||0)>0)list.push({level:'warning',text:`${row.name}: ponad 40 godzin obsługi w miesiącu.`});
   if(Number(row.costs||0)>Number(row.netTotal||0)*0.3&&Number(row.costs||0)>0)list.push({level:'warning',text:`${row.name}: wysokie koszty dodatkowe (${money(row.costs)}).`});
   if(health.key==='NO_DATA'&&String(row.status||'')!=='INACTIVE')list.push({level:'info',text:`${row.name}: brak aktywności w wybranym miesiącu.`});
  });
  return list.slice(0,12);
 },[rows]);

 const filteredRows=useMemo(()=>rows.filter(row=>{
  const health=getCompanyHealth(row).key;
  const assigned=row.assignedUser?.id||row.assignedUserId||'';
  const billing=String(row.billingType||'').toUpperCase();
  return (healthFilter==='ALL'||health===healthFilter)&&
   (workerFilter==='ALL'||assigned===workerFilter)&&
   (billingFilter==='ALL'||billing===billingFilter)&&
   String(row.name||'').toLowerCase().includes(search.toLowerCase());
 }),[rows,healthFilter,workerFilter,billingFilter,search]);

 const best=[...rows].filter(row=>Number(row.netTotal||0)||Number(row.minutes||0)).sort((a,b)=>b.profit-a.profit).slice(0,10);
 const weakest=[...rows].filter(row=>Number(row.netTotal||0)||Number(row.minutes||0)).sort((a,b)=>a.profit-b.profit).slice(0,10);
 const comparison=[
  {name:'Przychód',poprzedni:incomePrevious,bieżący:rows.reduce((s,r)=>s+Number(r.netTotal||0),0)},
  {name:'Zysk',poprzedni:totalPrevious,bieżący:rows.reduce((s,r)=>s+Number(r.profit||0),0)},
  {name:'Koszty',poprzedni:previousRows.reduce((s,r)=>s+Number(r.costs||0)+Number(r.timeCost||0),0),bieżący:rows.reduce((s,r)=>s+Number(r.costs||0)+Number(r.timeCost||0),0)}
 ];
 const workers=useMemo(()=>{
  return (data.users||[]).map(worker=>{
   const entries=(data.workEntries||[]).filter(entry=>entry.userId===worker.id&&String(entry.date||'').slice(0,7)===selectedMonth);
   const companyIds=new Set(entries.map(entry=>entry.companyId));
   const minutes=entries.reduce((sum,entry)=>sum+Number(entry.minutes||0),0);
   const counts={};entries.forEach(entry=>counts[entry.companyId]=(counts[entry.companyId]||0)+Number(entry.minutes||0));
   const topId=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
   return {...worker,minutes,entryCount:entries.length,companyCount:companyIds.size,topCompany:(data.companies||[]).find(c=>c.id===topId)?.name||'-'};
  }).filter(worker=>worker.role==='WORKER'||worker.minutes>0);
 },[data,selectedMonth]);

 return <div className="panel">
  <div className="row between"><h1>Centrum zarządzania</h1><label>Miesiąc: <input type="month" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} style={{marginLeft:8,maxWidth:180}}/></label></div>
  <div className="kpis">
   <div className="card">Przychód<h2>{money(rows.reduce((s,r)=>s+Number(r.netTotal||0),0))}</h2><small>{percentChange(rows.reduce((s,r)=>s+Number(r.netTotal||0),0),incomePrevious).toFixed(1)}% m/m</small></div>
   <div className="card">Zysk po kosztach<h2>{money(adminKpis.totalProfit)}</h2><small>{percentChange(adminKpis.totalProfit,totalPrevious).toFixed(1)}% m/m</small></div>
   <div className="card">Łączny czas<h2>{minToText(rows.reduce((s,r)=>s+Number(r.minutes||0),0))}</h2><small>{percentChange(rows.reduce((s,r)=>s+Number(r.minutes||0),0),minutesPrevious).toFixed(1)}% m/m</small></div>
   <div className="card">Średnia stawka<h2>{Number(adminKpis.averageRate||0).toFixed(2)} zł/h</h2><small>{percentChange(adminKpis.averageRate,ratePrevious).toFixed(1)}% m/m</small></div>
   {[
    {key:'VERY_GOOD',icon:'📈',label:'Bardzo dobre',count:adminKpis.profitable,color:'#159447',description:'Firmy z wysokim zyskiem i dobrą stawką efektywną.',action:'Pokaż tylko bardzo dobre firmy'},
    {key:'WATCH',icon:'👀',label:'Do obserwacji',count:adminKpis.watch,color:'#b88900',description:'Firmy z dodatnim wynikiem, które wymagają regularnego monitorowania.',action:'Pokaż firmy do obserwacji'},
    {key:'AT_RISK',icon:'⚠️',label:'Zagrożone',count:adminKpis.atRisk,color:'#f07c00',description:'Firmy z niską stawką efektywną lub zbyt dużym nakładem czasu.',action:'Pokaż zagrożone firmy'},
    {key:'UNPROFITABLE',icon:'🚨',label:'Nierentowne',count:adminKpis.unprofitable,color:'#d9343a',description:'Firmy generujące stratę w wybranym miesiącu.',action:'Pokaż nierentowne firmy'}
   ].map(tile=>
    <button
     key={tile.key}
     type="button"
     onClick={()=>applyHealthFilter(tile.key)}
     title={tile.action}
     aria-label={tile.action}
     className="card"
     style={{
      textAlign:'left',
      borderLeft:`6px solid ${tile.color}`,
      cursor:'pointer',
      color:'#111827',
      background:'#fff',
      padding:18,
      minHeight:170,
      display:'flex',
      flexDirection:'column',
      alignItems:'stretch',
      justifyContent:'space-between'
     }}
    >
     <div>
      <div style={{display:'flex',alignItems:'center',gap:8,fontWeight:800,fontSize:17}}>
       <span aria-hidden="true">{tile.icon}</span>
       <span>{tile.label}</span>
      </div>
      <h2 style={{margin:'10px 0 8px',color:'#111827'}}>{tile.count} firm</h2>
      <p style={{margin:0,color:'#52606d',fontSize:13,lineHeight:1.4}}>{tile.description}</p>
     </div>
     <div style={{marginTop:14,paddingTop:10,borderTop:'1px solid #e5e9ee',fontWeight:800,color:tile.color,fontSize:13}}>
      🔍 {tile.action}
     </div>
    </button>
   )}
  </div>

  <div style={{display:'grid',gridTemplateColumns:'repeat(3, minmax(0, 1fr))',gap:16,marginTop:16,alignItems:'stretch'}}>
   <div className="card" style={{margin:0,minWidth:0,height:'100%'}}>
    <h2>Wymagają uwagi</h2>
    <p className="muted" style={{marginTop:-4}}>Najważniejsze alerty dla wybranego miesiąca.</p>
    {alerts.length===0?<p className="muted">Brak istotnych alertów.</p>:<div style={{display:'grid',gap:8,maxHeight:420,overflowY:'auto',paddingRight:4}}>{alerts.map((alert,index)=><div key={index} className={alert.level==='danger'?'warnBox':'infoBox'} style={{borderLeft:`5px solid ${alert.level==='danger'?'#d9343a':alert.level==='warning'?'#f07c00':'#7b8794'}`}}>{alert.text}</div>)}</div>}
   </div>
   <div className="card" style={{margin:0,minWidth:0,height:'100%'}}>
    <h2>10 najlepszych firm</h2>
    <p className="muted" style={{marginTop:-4}}>Ranking według najwyższego zysku po kosztach.</p>
    {best.map((row,index)=><div key={row.id||row.name} className="row between" style={{padding:'8px 0',borderBottom:'1px solid #e6ebf0',gap:12}}><span style={{minWidth:0}}>{index+1}. <b>{row.name}</b></span><span style={{whiteSpace:'nowrap'}}>{money(row.profit)}</span></div>)}
   </div>
   <div className="card" style={{margin:0,minWidth:0,height:'100%'}}>
    <h2>10 najsłabszych firm</h2>
    <p className="muted" style={{marginTop:-4}}>Ranking według najniższego zysku po kosztach.</p>
    {weakest.map((row,index)=><div key={row.id||row.name} className="row between" style={{padding:'8px 0',borderBottom:'1px solid #e6ebf0',gap:12}}><span style={{minWidth:0}}>{index+1}. <b>{row.name}</b></span><span style={{whiteSpace:'nowrap',textAlign:'right'}}>{money(row.profit)}<br/><small>{Number(row.rate||0).toFixed(2)} zł/h</small></span></div>)}
   </div>
  </div>

  <div className="card" style={{marginTop:16}}><h2>Porównanie z poprzednim miesiącem ({previousMonth})</h2><div style={{height:280}}><ResponsiveContainer width="100%" height="100%"><BarChart data={comparison}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip formatter={value=>money(value)}/><Legend/><Bar dataKey="poprzedni" name="Poprzedni miesiąc" fill="#7b8794"/><Bar dataKey="bieżący" name="Bieżący miesiąc" fill="#ff5a14"/></BarChart></ResponsiveContainer></div></div>

  <div id="admin-company-table" className="card" style={{marginTop:16,scrollMarginTop:20}}><h2>Firmy — pełny podgląd</h2>
   {healthFilter!=='ALL'&&<div className="infoBox" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:12}}>
    <span>Aktywny filtr: <b>{healthFilterLabels[healthFilter]||healthFilter}</b>. Tabela pokazuje tylko firmy z tej kategorii.</span>
    <button type="button" className="light" onClick={()=>setHealthFilter('ALL')}>✕ Wyczyść filtr</button>
   </div>}
   <div className="filterBar"><input placeholder="Szukaj firmy..." value={search} onChange={e=>setSearch(e.target.value)}/><select value={healthFilter} onChange={e=>setHealthFilter(e.target.value)}><option value="ALL">Wszystkie oceny</option><option value="VERY_GOOD">Bardzo dobre</option><option value="WATCH">Do obserwacji</option><option value="AT_RISK">Zagrożone</option><option value="UNPROFITABLE">Nierentowne</option><option value="NO_DATA">Bez danych</option></select><select value={workerFilter} onChange={e=>setWorkerFilter(e.target.value)}><option value="ALL">Wszyscy opiekunowie</option>{(data.users||[]).map(worker=><option key={worker.id} value={worker.id}>{worker.name}</option>)}</select><select value={billingFilter} onChange={e=>setBillingFilter(e.target.value)}><option value="ALL">Wszystkie rozliczenia</option><option value="MONTHLY">Miesięczne</option><option value="ONE_TIME">Jednorazowe</option><option value="HOURLY">Godzinowe</option></select><button type="button" className="light" onClick={()=>{setHealthFilter('ALL');setWorkerFilter('ALL');setBillingFilter('ALL');setSearch('')}}>Wyczyść</button></div>
   <SummaryTable
    rows={filteredRows}
    selectedMonth={selectedMonth}
    previousMap={previousMap}
    onDetails={row=>{
     setSelectedDetail(row);
     setTimeout(()=>{
      document.getElementById('admin-company-details')?.scrollIntoView({behavior:'smooth',block:'start'});
     },80);
    }}
   />
  </div>

  <div className="card" style={{marginTop:16}}><h2>Podsumowanie pracowników</h2><div className="tableWrap"><table><thead><tr><th>Pracownik</th><th>Liczba firm</th><th>Czas pracy</th><th>Liczba wpisów</th><th>Najczęściej obsługiwana firma</th></tr></thead><tbody>{workers.map(worker=><tr key={worker.id}><td>{worker.name}</td><td>{worker.companyCount}</td><td>{minToText(worker.minutes)}</td><td>{worker.entryCount}</td><td>{worker.topCompany}</td></tr>)}</tbody></table></div></div>

  <div className="card" style={{marginTop:16}}><h2>Dzisiejsze alerty administracyjne</h2><p>• Firmy bez aktywności: <b>{adminKpis.noData}</b></p><p>• Zlecenia oczekujące na rozliczenie: <b>{adminKpis.pendingOrders}</b></p><p>• Firmy nierentowne: <b>{adminKpis.unprofitable}</b></p><p>• Pracownicy bez wpisów w tym miesiącu: <b>{workers.filter(worker=>worker.entryCount===0).length}</b></p></div>

  {selectedDetail&&<CompanyAdminDetails row={selectedDetail} data={data} selectedMonth={selectedMonth} onClose={()=>setSelectedDetail(null)}/>} 
 </div>
}

function CompanyAdminDetails({row,data,selectedMonth,onClose}){
 const [historySourceFilter,setHistorySourceFilter]=useState('ALL');
 const [historySort,setHistorySort]=useState({key:'date',direction:'desc'});

 const companyEntries=useMemo(()=>[
  ...(row.entries||[]).map(entry=>({
   id:`WORK-${entry.id}`,
   source:'Obsługa miesięczna',
   date:entry.date,
   userId:entry.userId,
   userName:entry.user?.name||(data.users||[]).find(user=>user.id===entry.userId)?.name||'Nieznany pracownik',
   type:entry.type||'inne',
   description:entry.description||entry.title||'-',
   minutes:Number(entry.minutes||0),
   travelMinutes:Number(entry.travelMinutes||0),
   netAmount:0,
   orderNumber:entry.orderNumber||null
  })),
  ...(row.orders||[])
   .filter(order=>String(order.type||'').toLowerCase()!=='szkolenie wstępne')
   .map(order=>({
    id:`EXTRA-${order.id}`,
    source:'Zlecenie dodatkowe',
    date:order.date,
    userId:order.userId,
    userName:order.user?.name||(data.users||[]).find(user=>user.id===order.userId)?.name||'Nieznany pracownik',
    type:order.type||'inne',
    description:order.description||order.title||'-',
    minutes:Number(order.minutes||0),
    travelMinutes:Number(order.travelMinutes||0),
    netAmount:Number(order.netAmount||0),
    orderNumber:order.orderNumber||null
   }))
 ].sort((a,b)=>new Date(b.date)-new Date(a.date)),[row.entries,row.orders,data.users]);

 const visibleCompanyEntries=useMemo(()=>{
  const filtered=companyEntries.filter(item=>
   historySourceFilter==='ALL'||
   (historySourceFilter==='MONTHLY'&&item.source==='Obsługa miesięczna')||
   (historySourceFilter==='EXTRA'&&item.source==='Zlecenie dodatkowe')
  );

  return [...filtered].sort((a,b)=>{
   let av;
   let bv;

   if(historySort.key==='date'){
    av=new Date(a.date||0).getTime();
    bv=new Date(b.date||0).getTime();
   }else if(historySort.key==='total'){
    av=Number(a.minutes||0)+Number(a.travelMinutes||0);
    bv=Number(b.minutes||0)+Number(b.travelMinutes||0);
   }else if(['minutes','travelMinutes','netAmount'].includes(historySort.key)){
    av=Number(a[historySort.key]||0);
    bv=Number(b[historySort.key]||0);
   }else{
    av=String(a[historySort.key]||'').toLocaleLowerCase('pl-PL');
    bv=String(b[historySort.key]||'').toLocaleLowerCase('pl-PL');
   }

   if(av>bv)return historySort.direction==='asc'?1:-1;
   if(av<bv)return historySort.direction==='asc'?-1:1;
   return 0;
  });
 },[companyEntries,historySourceFilter,historySort]);

 function toggleHistorySort(key){
  setHistorySort(prev=>({
   key,
   direction:prev.key===key&&prev.direction==='asc'?'desc':'asc'
  }));
 }

 function historySortArrow(key){
  if(historySort.key!==key)return '↕';
  return historySort.direction==='asc'?'↑':'↓';
 }

 const totals=useMemo(()=>companyEntries.reduce((result,item)=>({
  work:result.work+item.minutes,
  travel:result.travel+item.travelMinutes,
  total:result.total+item.minutes+item.travelMinutes
 }),{work:0,travel:0,total:0}),[companyEntries]);

 const byType=useMemo(()=>{
  const map=new Map();
  companyEntries.forEach(item=>{
   const key=String(item.type||'inne').trim()||'inne';
   const current=map.get(key)||{type:key,work:0,travel:0,total:0,count:0,workers:new Set()};
   current.work+=item.minutes;
   current.travel+=item.travelMinutes;
   current.total+=item.minutes+item.travelMinutes;
   current.count+=1;
   current.workers.add(item.userName);
   map.set(key,current);
  });
  return [...map.values()]
   .map(item=>({...item,workerCount:item.workers.size}))
   .sort((a,b)=>b.total-a.total);
 },[companyEntries]);

 const byWorker=useMemo(()=>{
  const map=new Map();
  companyEntries.forEach(item=>{
   const key=item.userName||'Nieznany pracownik';
   const current=map.get(key)||{name:key,work:0,travel:0,total:0,count:0};
   current.work+=item.minutes;
   current.travel+=item.travelMinutes;
   current.total+=item.minutes+item.travelMinutes;
   current.count+=1;
   map.set(key,current);
  });
  return [...map.values()].sort((a,b)=>b.total-a.total);
 },[companyEntries]);

 const series=useMemo(()=>{
  const result=[];const [year,month]=selectedMonth.split('-').map(Number);
  for(let offset=5;offset>=0;offset--){const d=new Date(year,month-1-offset,1);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;const current=calculateRowsForMonth(data,key).find(item=>String(item.name||'').toLowerCase()===String(row.name||'').toLowerCase());result.push({month:key,zysk:Number(current?.profit||0),czas:Number(current?.minutes||0)/60});}
  return result;
 },[data,row.name,selectedMonth]);

 return <div id="admin-company-details" className="card" style={{marginTop:16,border:'2px solid #ff5a14',scrollMarginTop:16}}>
  <div className="row between">
   <div>
    <h2 style={{marginBottom:4}}>Szczegóły firmy: {row.name}</h2>
    <div className="muted">Rozliczenie czasu za miesiąc {selectedMonth}</div>
   </div>
   <button type="button" className="light" onClick={onClose}>Zamknij</button>
  </div>

  <div className="kpis">
   <div className="card">Przychód<h2>{money(row.netTotal)}</h2></div>
   <div className="card">Koszty<h2>{money(Number(row.costs||0)+Number(row.timeCost||0))}</h2></div>
   <div className="card">Zysk<h2>{money(row.profit)}</h2></div>
   <div className="card">Stawka<h2>{Number(row.rate||0).toFixed(2)} zł/h</h2></div>
   <div className="card">Czas pracy<h2>{minToText(totals.work)}</h2></div>
   <div className="card">Czas dojazdów<h2>{minToText(totals.travel)}</h2></div>
   <div className="card">Praca + dojazdy<h2>{minToText(totals.total)}</h2></div>
   <div className="card">Opiekun<h2>{row.assignedUser?.name||'-'}</h2></div>
  </div>

  <div style={{height:260,marginTop:16}}>
   <ResponsiveContainer width="100%" height="100%">
    <LineChart data={series}>
     <CartesianGrid strokeDasharray="3 3"/>
     <XAxis dataKey="month"/>
     <YAxis/>
     <Tooltip/>
     <Legend/>
     <Line type="monotone" dataKey="zysk" name="Zysk (zł)" stroke="#ff5a14"/>
     <Line type="monotone" dataKey="czas" name="Czas (h)" stroke="#132734"/>
    </LineChart>
   </ResponsiveContainer>
  </div>

  <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:16,marginTop:18}}>
   <div className="card" style={{margin:0,minWidth:0}}>
    <h3 style={{marginTop:0}}>Na co przeznaczono czas</h3>
    <div className="tableWrap">
     <table>
      <thead><tr><th>Czynność</th><th>Wpisy</th><th>Praca</th><th>Dojazdy</th><th>Łącznie</th></tr></thead>
      <tbody>{byType.map(item=><tr key={item.type}><td><b>{item.type}</b></td><td>{item.count}</td><td>{minToText(item.work)}</td><td>{item.travel?minToText(item.travel):'-'}</td><td><b>{minToText(item.total)}</b></td></tr>)}</tbody>
     </table>
    </div>
   </div>

   <div className="card" style={{margin:0,minWidth:0}}>
    <h3 style={{marginTop:0}}>Czas według pracowników</h3>
    <div className="tableWrap">
     <table>
      <thead><tr><th>Pracownik</th><th>Wpisy</th><th>Praca</th><th>Dojazdy</th><th>Łącznie</th></tr></thead>
      <tbody>{byWorker.map(worker=><tr key={worker.name}><td><b>{worker.name}</b></td><td>{worker.count}</td><td>{minToText(worker.work)}</td><td>{worker.travel?minToText(worker.travel):'-'}</td><td><b>{minToText(worker.total)}</b></td></tr>)}</tbody>
     </table>
    </div>
   </div>
  </div>

  <div className="row between" style={{marginTop:18,gap:12,flexWrap:'wrap'}}>
   <h3 style={{margin:0}}>Szczegółowa historia pracy i dojazdów</h3>
   <label style={{display:'flex',alignItems:'center',gap:8,fontWeight:700}}>
    Filtr źródła:
    <select value={historySourceFilter} onChange={e=>setHistorySourceFilter(e.target.value)} style={{width:'auto',minWidth:220,margin:0}}>
     <option value="ALL">Wszystkie wpisy</option>
     <option value="MONTHLY">Obsługa miesięczna</option>
     <option value="EXTRA">Zlecenia dodatkowe</option>
    </select>
   </label>
  </div>
  <div className="tableWrap" style={{marginTop:12}}>
   <table>
    <thead><tr>
     <th onClick={()=>toggleHistorySort('date')} style={{cursor:'pointer'}}>Data {historySortArrow('date')}</th>
     <th onClick={()=>toggleHistorySort('userName')} style={{cursor:'pointer'}}>Pracownik {historySortArrow('userName')}</th>
     <th onClick={()=>toggleHistorySort('source')} style={{cursor:'pointer'}}>Źródło {historySortArrow('source')}</th>
     <th onClick={()=>toggleHistorySort('type')} style={{cursor:'pointer'}}>Czynność {historySortArrow('type')}</th>
     <th>Opis</th>
     <th onClick={()=>toggleHistorySort('orderNumber')} style={{cursor:'pointer'}}>Numer zlecenia / PO {historySortArrow('orderNumber')}</th>
     <th onClick={()=>toggleHistorySort('netAmount')} style={{cursor:'pointer'}}>Kwota zlecenia {historySortArrow('netAmount')}</th>
     <th onClick={()=>toggleHistorySort('minutes')} style={{cursor:'pointer'}}>Praca {historySortArrow('minutes')}</th>
     <th onClick={()=>toggleHistorySort('travelMinutes')} style={{cursor:'pointer'}}>Dojazd {historySortArrow('travelMinutes')}</th>
     <th onClick={()=>toggleHistorySort('total')} style={{cursor:'pointer'}}>Łącznie {historySortArrow('total')}</th>
    </tr></thead>
    <tbody>{visibleCompanyEntries.map(item=><tr key={item.id}>
     <td>{String(item.date||'').slice(0,10)}</td>
     <td>{item.userName}</td>
     <td>{item.source}</td>
     <td>{item.type}</td>
     <td style={{maxWidth:420,whiteSpace:'normal'}}>{item.description}</td>
     <td>{item.orderNumber||'-'}</td>
     <td>{item.source==='Zlecenie dodatkowe'?money(item.netAmount):'-'}</td>
     <td>{minToText(item.minutes)}</td>
     <td>{item.travelMinutes?minToText(item.travelMinutes):'-'}</td>
     <td><b>{minToText(item.minutes+item.travelMinutes)}</b></td>
    </tr>)}</tbody>
   </table>
  </div>

  {visibleCompanyEntries.length===0&&<p className="muted">Brak wpisów spełniających wybrany filtr.</p>}
 </div>
}

function SummaryTable({rows, selectedMonth, previousMap=new Map(), onDetails}){
 const [sort,setSort]=useState({key:'profit',direction:'desc'});
 function toggleSort(key){setSort(prev=>({key,direction:prev.key===key&&prev.direction==='desc'?'asc':'desc'}))}
 function arrow(key){return sort.key===key?(sort.direction==='asc'?'↑':'↓'):'↕'}
 const sortedRows=[...rows].sort((a,b)=>{let av=a[sort.key],bv=b[sort.key];if(typeof av==='string'){av=av.toLowerCase();bv=String(bv||'').toLowerCase()}return av>bv?(sort.direction==='asc'?1:-1):av<bv?(sort.direction==='asc'?-1:1):0});
 return <div className="tableWrap"><table><thead><tr><th>Ocena</th><th onClick={()=>toggleSort('name')} style={{cursor:'pointer'}}>Firma {arrow('name')}</th><th>Opiekun</th><th onClick={()=>toggleSort('minutes')} style={{cursor:'pointer'}}>Godziny {arrow('minutes')}</th><th onClick={()=>toggleSort('netTotal')} style={{cursor:'pointer'}}>Przychód {arrow('netTotal')}</th><th onClick={()=>toggleSort('costs')} style={{cursor:'pointer'}}>Koszty {arrow('costs')}</th><th onClick={()=>toggleSort('profit')} style={{cursor:'pointer'}}>Zysk {arrow('profit')}</th><th onClick={()=>toggleSort('rate')} style={{cursor:'pointer'}}>Stawka/h {arrow('rate')}</th><th>Zmiana m/m</th><th>Ostatnia aktywność</th><th>Akcje</th></tr></thead><tbody>{sortedRows.map(row=>{const health=getCompanyHealth(row);const previous=previousMap.get(String(row.name||'').toLowerCase());return <tr key={row.id||row.name} style={{background:health.background}}><td><span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 8px',border:`1px solid ${health.color}`,borderRadius:999,color:health.color,fontWeight:800,whiteSpace:'nowrap'}}><span style={{width:8,height:8,borderRadius:'50%',background:health.color}}></span>{health.label}</span></td><td><b>{row.name}</b></td><td>{row.assignedUser?.name||'-'}</td><td>{minToText(row.minutes)}</td><td>{money(row.netTotal)}</td><td>{money(Number(row.costs||0)+Number(row.timeCost||0))}</td><td>{money(row.profit)}</td><td>{Number(row.rate||0).toFixed(2)} zł/h</td><td>{percentChange(row.profit,previous?.profit).toFixed(1)}%</td><td>{row.lastActivity?new Date(row.lastActivity).toLocaleDateString('pl-PL'):'-'}</td><td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button type="button" className="light" onClick={()=>onDetails?.(row)}>Szczegóły</button><button className="orange" type="button" onClick={()=>generateProfitPdf(row,selectedMonth)}>PDF</button></div></td></tr>})}</tbody></table></div>
}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
function CompanyDetails({company,users,orders,onSubmit,onDelete}){
 const missing=['address','contactPerson','phone','email'].filter(k=>!company[k]);
 return <form id="companyEditForm" className="detailBox" onSubmit={onSubmit}><div className="row between"><h2>Dane firmy: {company.name}</h2><button type="button" className="red" onClick={onDelete}>🗑️ Usuń firmę</button></div>{missing.length>0&&<div className="warnBox">Brakuje danych: {missing.join(', ')}. Możesz wpisać NIP i kliknąć „Uzupełnij puste dane z NIP”.</div>}<div className="companyInfo"><div className="infoBox"><b>Kontakt</b>{company.contactPerson||'brak danych'}</div><div className="infoBox"><b>Email</b>{company.email||'brak danych'}</div><div className="infoBox"><b>Telefon</b>{company.phone||'brak danych'}</div><div className="infoBox"><b>Adres</b>{company.address||'brak danych'}</div><div className="infoBox"><b>Pracownik</b>{company.assignedUser?.name||'nie przypisano'}</div><div className="infoBox"><b>Status firmy</b><span className={'status '+company.status}></span>{company.status}</div></div><div className="grid2"><Field label="Nazwa firmy"><input name="name" defaultValue={company.name}/></Field><Field label="NIP"><input name="nip" defaultValue={company.nip||''} placeholder="NIP" onBlur={e=>autofillByNip(e.currentTarget.form)}/></Field><Field label="Adres"><input name="address" defaultValue={company.address||''} placeholder="Adres"/></Field><Field label="Osoba kontaktowa"><input name="contactPerson" defaultValue={company.contactPerson||''} placeholder="Osoba kontaktowa"/></Field><Field label="Telefon"><input name="phone" defaultValue={company.phone||''} placeholder="Telefon"/></Field><Field label="Email"><input name="email" defaultValue={company.email||''} placeholder="Email"/></Field><Field label="Typ obsługi"><input name="serviceType" defaultValue={company.serviceType||''} placeholder="np. BHP, stała obsługa"/></Field><Field label="Przypisany pracownik"><select name="assignedUserId" defaultValue={company.assignedUserId||''}><option value="">Brak pracownika</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Field><Field label="Status firmy"><select name="status" defaultValue={company.status}><option value="ACTIVE">aktywna</option><option value="PAUSED">zawieszona</option><option value="INACTIVE">nieaktywna</option></select></Field><Field label="Typ rozliczenia"><select name="billingType" defaultValue={company.billingType}><option value="MONTHLY">miesięczne</option><option value="ONE_TIME">jednorazowe</option><option value="HOURLY">godzinowe</option></select></Field><Field label="Kwota netto miesięcznie"><input name="netAmount" defaultValue={company.netAmount||''} placeholder="Kwota netto miesięcznie"/></Field><Field label="Koszt dojazdów"><input name="travelCost" defaultValue={company.travelCost||''} placeholder="Koszt dojazdów"/></Field><Field label="Dodatkowe koszty"><input name="extraCost" defaultValue={company.extraCost||''} placeholder="Dodatkowe koszty"/></Field><Field label="Opis dodatkowych kosztów / uwagi"><input name="extraCostDescription" defaultValue={company.extraCostDescription||''} placeholder="np. ratownik medyczny, PO, mail po angielsku"/></Field><Field label="Szerokość geograficzna"><input name="latitude" type="number" step="any" defaultValue={company.latitude??''} placeholder="np. 50.033"/></Field><Field label="Długość geograficzna"><input name="longitude" type="number" step="any" defaultValue={company.longitude??''} placeholder="np. 20.217"/></Field></div><div className="row"><button type="button" className="light" onClick={e=>autofillByNip(e.currentTarget.form)}>Uzupełnij puste dane z NIP</button><button className="orange">Zapisz zmiany firmy</button></div>{orders?.length>0&&<div className="card"><h3>Zlecenia dodatkowe tej firmy</h3><table><thead><tr><th>Data</th><th>Nazwa</th><th>Czas</th><th>Dojazd</th><th>Kwota</th><th>Koszty</th><th>Koszt czasu</th><th>Status</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>{String(o.date).slice(0,10)}</td><td>{o.title}</td><td>{minToText(Number(o.minutes||0))}</td><td>{Number(o.travelMinutes||0)>0?minToText(Number(o.travelMinutes||0)):'-'}</td><td>{money(o.netAmount)}</td><td>{money(Number(o.travelCost||0)+Number(o.extraCost||0))}</td><td>{money(((Number(o.minutes||0)+Number(o.travelMinutes||0))/60)*250)}</td><td>{o.status}</td></tr>)}</tbody></table></div>}</form>}
function InitialTrainingsPanel({data,training,setTraining,addInitialTraining,deleteExtraOrder}){const people=Number(training.peopleCount||0);const unit=Number(training.unitAmount||0);const autoTotal=people*unit;const trainings=(data.extraOrders||[]).filter(o=>String(o.type||'').toLowerCase()==='szkolenie wstępne');return <div className="panel"><h1>Szkolenia wstępne</h1><form className="card" onSubmit={addInitialTraining}><h2>Dodaj szkolenie wstępne</h2><div className="grid2"><Field label="Data szkolenia"><input type="date" value={training.date} onChange={e=>setTraining({...training,date:e.target.value})}/></Field><Field label="Firma z obsługi"><select value={training.companyId} onChange={e=>setTraining({...training,companyId:e.target.value,newCompanyName:e.target.value?'':training.newCompanyName})}><option value="">Wybierz firmę z listy</option>{data.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Albo dopisz nową firmę"><input placeholder="Nazwa nowej firmy, jeśli nie ma jej na liście" value={training.newCompanyName} onChange={e=>setTraining({...training,newCompanyName:e.target.value,companyId:e.target.value?training.companyId:''})}/></Field><Field label="Czas poświęcony na szkolenie"><input placeholder="domyślnie 1:00" value={training.time} onChange={e=>setTraining({...training,time:e.target.value})}/></Field><Field label="Kwota netto za osobę"><input type="number" placeholder="np. 109" value={training.unitAmount} onChange={e=>{const unitAmount=e.target.value;const peopleCount=Number(training.peopleCount||1);setTraining({...training,unitAmount,netAmount:String(Number(unitAmount||0)*peopleCount)})}}/></Field><Field label="Ilość osób na szkoleniu"><input type="number" min="1" placeholder="np. 5" value={training.peopleCount} onChange={e=>{const peopleCount=e.target.value;const unitAmount=Number(training.unitAmount||0);setTraining({...training,peopleCount,netAmount:String(unitAmount*Number(peopleCount||0))})}}/></Field><Field label="Wartość szkolenia — automatycznie albo wpisz ręcznie"><input
  name="netAmount"
  type="number"
  placeholder={`Automatycznie: ${autoTotal || 0} zł, albo wpisz ręcznie`}
  value={training.netAmount||''}
  onChange={e=>setTraining({...training,netAmount:e.target.value})}
/></Field><Field label="Status"><select value={training.status} onChange={e=>setTraining({...training,status:e.target.value})}><option value="DONE">wykonane</option><option value="OPEN">otwarte</option><option value="INVOICED">zafakturowane</option><option value="PAID">opłacone</option></select></Field><Field label="Opis kosztów dodatkowych"><input placeholder="np. materiały, sala, dojazd, ratownik" value={training.extraCostDescription} onChange={e=>setTraining({...training,extraCostDescription:e.target.value})}/></Field></div><Field label="Opis szkolenia"><textarea placeholder="np. szkolenie wstępne BHP dla nowych pracowników" value={training.description} onChange={e=>setTraining({...training,description:e.target.value})}/></Field><p className="muted">Po dodaniu szkolenie zostanie podpięte pod wybraną firmę. Kwota szkolenia będzie przychodem firmy, a czas szkolenia doliczy się do godzin w podsumowaniu.</p><button className="orange">Dodaj szkolenie</button></form><div className="card"><h2>Lista szkoleń wstępnych</h2><div className="tableWrap"><table><thead><tr><th>Data</th><th>Firma</th><th>Czas</th><th>Wartość szkolenia</th><th>Opis kosztów</th><th>Status</th><th>Akcje</th></tr></thead><tbody>{trainings.map(o=><tr key={o.id}><td>{String(o.date).slice(0,10)}</td><td>{o.company?.name||'-'}</td><td>{minToText(Number(o.minutes||0))}</td><td>{money(o.netAmount)}</td><td>{o.extraCostDescription||'-'}</td><td>{o.status}</td><td><button className="light iconBtn" onClick={()=>deleteExtraOrder(o)}>🗑️</button></td></tr>)}</tbody></table></div></div></div>}

function ExtraOrdersPanel({data,order,setOrder,addExtraOrder,deleteExtraOrder}){return <div className="panel"><h1>Zlecenia dodatkowe</h1><form className="card" onSubmit={addExtraOrder}><h2>Dodaj zlecenie poza miesięczną obsługą</h2><div className="grid2"><Field label="Data zlecenia"><input type="date" value={order.date} onChange={e=>setOrder({...order,date:e.target.value})}/></Field><Field label="Firma"><select value={order.companyId} onChange={e=>setOrder({...order,companyId:e.target.value,newCompanyName:e.target.value?'':order.newCompanyName})}><option value="">Wybierz firmę</option>{data.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Albo wpisz nową firmę"><input placeholder="Nazwa nowej firmy, jeśli nie ma jej na liście" value={order.newCompanyName||''} onChange={e=>setOrder({...order,newCompanyName:e.target.value,companyId:e.target.value?'':order.companyId})}/></Field><Field label="Nazwa zlecenia"><input placeholder="np. Szkolenie robotnicze" value={order.title} onChange={e=>setOrder({...order,title:e.target.value})}/></Field><Field label="Typ zlecenia"><select value={order.type} onChange={e=>setOrder({...order,type:e.target.value})}>{orderTypes.map(t=><option key={t}>{t}</option>)}</select></Field><Field label="Numer zlecenia / PO"><input placeholder="opcjonalnie" value={order.orderNumber} onChange={e=>setOrder({...order,orderNumber:e.target.value})}/></Field><Field label="Status"><select value={order.status} onChange={e=>setOrder({...order,status:e.target.value})}><option value="OPEN">otwarte</option><option value="DONE">wykonane</option><option value="INVOICED">zafakturowane</option><option value="PAID">opłacone</option></select></Field><Field label="Czas poświęcony na zlecenie"><input placeholder="np. 4:00, 2h 30m, 150m" value={order.time} onChange={e=>setOrder({...order,time:e.target.value})}/></Field><Field label="Kwota netto za zlecenie"><input type="number" placeholder="np. 1500" value={order.netAmount} onChange={e=>setOrder({...order,netAmount:e.target.value})}/></Field><Field label="Koszt dojazdów"><input type="number" placeholder="np. 200" value={order.travelCost} onChange={e=>setOrder({...order,travelCost:e.target.value})}/></Field><Field label="Dodatkowe koszty"><input type="number" placeholder="np. ratownik 500" value={order.extraCost} onChange={e=>setOrder({...order,extraCost:e.target.value})}/></Field><Field label="Opis dodatkowych kosztów"><input placeholder="np. ratownik medyczny, sala, materiały" value={order.extraCostDescription} onChange={e=>setOrder({...order,extraCostDescription:e.target.value})}/></Field></div><Field label="Opis zlecenia"><textarea placeholder="Opis wykonania / uwagi" value={order.description} onChange={e=>setOrder({...order,description:e.target.value})}/></Field><button className="orange">Dodaj zlecenie</button></form><div className="card"><h2>Lista zleceń dodatkowych</h2><div className="tableWrap"><table><thead><tr><th>Data</th><th>Firma</th><th>Nazwa</th><th>Typ</th><th>Czas</th><th>Dojazd</th><th>Kwota</th><th>Koszty</th><th>Koszt czasu</th><th>Zysk</th><th>Status</th><th>Akcje</th></tr></thead><tbody>{(data.extraOrders||[]).filter(o=>!['szkolenie wstępne','zlecenie sklep'].includes(String(o.type||'').toLowerCase())).map(o=>{const costs=Number(o.travelCost||0)+Number(o.extraCost||0);const timeCost=((Number(o.minutes||0)+Number(o.travelMinutes||0))/60)*250;const profit=Number(o.netAmount||0)-costs-timeCost;return <tr key={o.id}><td>{String(o.date).slice(0,10)}</td><td>{o.company?.name||'-'}</td><td>{o.title}</td><td>{o.type}</td><td>{minToText(Number(o.minutes||0))}</td><td>{Number(o.travelMinutes||0)>0?minToText(Number(o.travelMinutes||0)):'-'}</td><td>{money(o.netAmount)}</td><td>{money(costs)}</td><td>{money(timeCost)}</td><td>{money(profit)}</td><td>{o.status}</td><td><button className="light iconBtn" onClick={()=>deleteExtraOrder(o)}>🗑️</button></td></tr>})}</tbody></table></div></div></div>}

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


function isoToday(){return new Date().toISOString().slice(0,10)}
function localDateFromIso(iso){const [y,m,d]=String(iso).slice(0,10).split('-').map(Number);return new Date(y,m-1,d,12,0,0)}
function businessDateList(from,to){
 const today=isoToday(); const effectiveTo=to>today?today:to;
 if(!from||!effectiveTo||from>effectiveTo)return [];
 const out=[]; const cursor=localDateFromIso(from); const end=localDateFromIso(effectiveTo);
 while(cursor<=end){const day=cursor.getDay();if(day!==0&&day!==6)out.push(cursor.toISOString().slice(0,10));cursor.setDate(cursor.getDate()+1)}
 return out;
}
function absenceTypeLabel(type){return ({VACATION:'🏖 Urlop',SICK_LEAVE:'🤒 L4',CARE:'👶 Opieka',TIME_OFF:'⏱ Odbiór nadgodzin',OTHER:'📌 Inna nieobecność'})[type]||type}
function absenceStatusLabel(status){return ({PENDING:'Oczekuje na akceptację',APPROVED:'Zaakceptowane',REJECTED:'Odrzucone'})[status]||status}
function monthRange(month){const [y,m]=month.split('-').map(Number);return {from:`${month}-01`,to:`${month}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`}}
function absenceMinutesForDate(absences,date,approvedOnly=true){
 return (absences||[]).filter(a=>(!approvedOnly||a.status==='APPROVED')&&String(a.dateFrom).slice(0,10)<=date&&String(a.dateTo).slice(0,10)>=date).reduce((sum,a)=>sum+Number(a.minutes||0),0);
}
function buildDailyReport({entries,extraOrders,absences,userId,dateFrom,dateTo}){
 const dates=businessDateList(dateFrom,dateTo); const grouped=new Map();
 const add=(entry)=>{if(entry.userId!==userId)return;const date=String(entry.date||'').slice(0,10);if(date<dateFrom||date>dateTo)return;const row=grouped.get(date)||{work:0,travel:0,entries:0,companies:new Set()};row.work+=Number(entry.minutes||0);row.travel+=Number(entry.travelMinutes||0);row.entries++;if(entry.company?.name)row.companies.add(entry.company.name);else if(entry.companyName)row.companies.add(entry.companyName);grouped.set(date,row)};
 (entries||[]).forEach(add);(extraOrders||[]).forEach(add);
 return dates.map(date=>{const row=grouped.get(date)||{work:0,travel:0,entries:0,companies:new Set()};const approvedAbsence=Math.min(480,absenceMinutesForDate(absences,date,true));const pending=(absences||[]).filter(a=>a.userId===userId&&a.status==='PENDING'&&String(a.dateFrom).slice(0,10)<=date&&String(a.dateTo).slice(0,10)>=date);const accounted=row.work+row.travel+approvedAbsence;const missing=Math.max(0,480-accounted);let status='OK';if(approvedAbsence>=480&&row.work+row.travel===0)status='ABSENCE';else if(missing===480)status='NO_ENTRY';else if(missing>0)status='MISSING';return {...row,date,absence:approvedAbsence,pending,accounted,missing,status,companies:[...row.companies].join(', ')||'-'};}).sort((a,b)=>b.date.localeCompare(a.date));
}

function WorkerMissingAlert({data,user,onOpen}){
 const today=isoToday(); const rows=buildDailyReport({entries:data.workEntries,extraOrders:data.extraOrders,absences:data.absences,userId:user.id,dateFrom:today,dateTo:today}); const row=rows[0];
 if(!row)return null;
 const bg=row.status==='OK'||row.status==='ABSENCE'?'#eaf8ef':row.status==='NO_ENTRY'?'#fdecec':'#fff6df';
 const border=row.status==='OK'||row.status==='ABSENCE'?'#24a15a':row.status==='NO_ENTRY'?'#e33d45':'#e5a100';
 const text=row.status==='ABSENCE'?'Dzisiaj masz zaakceptowaną nieobecność.':row.status==='OK'?`Dzisiejszy dzień jest rozliczony: ${minToText(row.accounted)}.`:row.status==='NO_ENTRY'?'Nie masz jeszcze żadnego wpisu za dzisiaj.':`Brakuje Ci dzisiaj ${minToText(row.missing)} do wymaganych 8 godzin.`;
 return <div className="card" style={{maxWidth:1000,marginTop:20,background:bg,borderLeft:`5px solid ${border}`}}><div className="row between"><div><h2 style={{margin:'0 0 6px'}}>Raport braków — alert</h2><b>{text}</b>{row.pending.length>0&&<div className="muted" style={{marginTop:6}}>Masz zgłoszoną nieobecność oczekującą na akceptację.</div>}</div><button className="orange" type="button" onClick={onOpen}>Otwórz raport braków</button></div></div>
}

function AbsenceForm({data,user,reload,admin=false,defaultUserId=''}){
 const today=isoToday();
 const [open,setOpen]=useState(false);
 const [saving,setSaving]=useState(false);
 const [form,setForm]=useState({userId:defaultUserId||user.id,type:'VACATION',dateFrom:today,dateTo:today,hours:'8',note:''});
 useEffect(()=>{if(defaultUserId)setForm(f=>({...f,userId:defaultUserId}))},[defaultUserId]);
 function closeModal(){if(!saving)setOpen(false)}
 async function submit(e){
  e.preventDefault();
  if(!form.userId)return alert('Wybierz pracownika.');
  if(!form.dateFrom||!form.dateTo)return alert('Wybierz zakres dat.');
  if(Number(form.hours||0)<=0)return alert('Podaj liczbę godzin dziennie.');
  try{
   setSaving(true);
   await jsonFetch('/api/absences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,minutes:Math.round(Number(form.hours||8)*60),status:admin?'APPROVED':undefined})});
   setForm(f=>({...f,dateFrom:today,dateTo:today,hours:'8',note:''}));
   await reload();
   setOpen(false);
   alert(admin?'Nieobecność została dodana i zaakceptowana.':'Zgłoszenie zostało wysłane do akceptacji administratora.');
  }catch(err){alert(err.message)}finally{setSaving(false)}
 }
 const selectedLabel=absenceTypeLabel(form.type);
 return <>
  <div className="card" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
   <div>
    <h2 style={{margin:'0 0 6px'}}>{admin?'Nieobecności pracownika':'Urlop, L4 i inne nieobecności'}</h2>
    <div className="muted">{admin?'Dodaj zaakceptowaną nieobecność dla wybranego pracownika.':'Zgłoś urlop, L4, opiekę, odbiór nadgodzin albo inną nieobecność.'}</div>
   </div>
   <button type="button" className="orange" onClick={()=>setOpen(true)}>+ Dodaj nieobecność</button>
  </div>
  {open&&<div
   role="dialog"
   aria-modal="true"
   aria-label={admin?'Dodaj nieobecność pracownika':'Dodaj nieobecność'}
   onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}
   style={{position:'fixed',inset:0,zIndex:3000,background:'rgba(8,23,34,.58)',display:'flex',alignItems:'center',justifyContent:'center',padding:18}}
  >
   <form onSubmit={submit} style={{width:'min(680px,100%)',maxHeight:'92vh',overflowY:'auto',background:'#fff',borderRadius:16,boxShadow:'0 24px 70px rgba(0,0,0,.32)',padding:24}}>
    <div className="row between" style={{alignItems:'flex-start',marginBottom:18}}>
     <div><h2 style={{margin:'0 0 6px'}}>Dodaj nieobecność</h2><div className="muted">Wybrano: <b>{selectedLabel}</b></div></div>
     <button type="button" className="light" onClick={closeModal} aria-label="Zamknij">✕</button>
    </div>
    <div className="grid2">
     {admin&&<Field label="Pracownik"><select value={form.userId} onChange={e=>setForm({...form,userId:e.target.value})} required><option value="">Wybierz pracownika</option>{(data.users||[]).filter(u=>u.active!==false).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>}
     <Field label="Rodzaj nieobecności"><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="VACATION">🏖 Urlop</option><option value="SICK_LEAVE">🤒 L4</option><option value="CARE">👶 Opieka</option><option value="TIME_OFF">⏱ Odbiór nadgodzin</option><option value="OTHER">📌 Inna nieobecność</option></select></Field>
     <Field label="Data od"><input type="date" value={form.dateFrom} onChange={e=>setForm({...form,dateFrom:e.target.value,dateTo:form.dateTo<e.target.value?e.target.value:form.dateTo})}/></Field>
     <Field label="Data do"><input type="date" value={form.dateTo} min={form.dateFrom} onChange={e=>setForm({...form,dateTo:e.target.value})}/></Field>
     <Field label="Liczba godzin dziennie"><input type="number" min="0.25" max="8" step="0.25" value={form.hours} onChange={e=>setForm({...form,hours:e.target.value})}/></Field>
    </div>
    <Field label="Opis / uwagi"><textarea value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Opcjonalnie, np. urlop wypoczynkowy" style={{minHeight:90}}/></Field>
    {!admin&&<div style={{background:'#eef5ff',borderLeft:'4px solid #3b82f6',padding:'11px 13px',borderRadius:8,marginTop:12}}>Zgłoszenie będzie oznaczone jako oczekujące do czasu akceptacji przez administratora.</div>}
    <div className="row" style={{justifyContent:'flex-end',marginTop:20}}><button type="button" className="light" onClick={closeModal} disabled={saving}>Anuluj</button><button className="orange" disabled={saving}>{saving?'Zapisywanie...':admin?'Dodaj i zaakceptuj':'Wyślij zgłoszenie'}</button></div>
   </form>
  </div>}
 </>
}

function MissingReportPanel({data,user,reload}){
 const currentMonth=isoToday().slice(0,7); const initial=monthRange(currentMonth); const [month,setMonth]=useState(currentMonth); const [dateFrom,setDateFrom]=useState(initial.from); const [dateTo,setDateTo]=useState(initial.to);
 function changeMonth(v){setMonth(v);const r=monthRange(v);setDateFrom(r.from);setDateTo(r.to)}
 const rows=useMemo(()=>buildDailyReport({entries:data.workEntries,extraOrders:data.extraOrders,absences:data.absences,userId:user.id,dateFrom,dateTo}),[data,dateFrom,dateTo,user.id]);
 const totals=rows.reduce((a,r)=>({work:a.work+r.work,travel:a.travel+r.travel,absence:a.absence+r.absence,missing:a.missing+r.missing,ok:a.ok+(r.missing===0?1:0),no:a.no+(r.status==='NO_ENTRY'?1:0),below:a.below+(r.status==='MISSING'?1:0)}),{work:0,travel:0,absence:0,missing:0,ok:0,no:0,below:0});
 async function remove(a){if(!confirm('Usunąć zgłoszenie?'))return;try{await jsonFetch('/api/absences/'+a.id,{method:'DELETE'});await reload()}catch(err){alert(err.message)}}
 const mine=(data.absences||[]).filter(a=>a.userId===user.id);
 return <div className="panel"><h1>Raport braków</h1><div className="card"><div className="grid2"><Field label="Miesiąc"><input type="month" value={month} onChange={e=>changeMonth(e.target.value)}/></Field><Field label="Data od"><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></Field><Field label="Data do"><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></Field></div></div><div className="kpis"><div className="card">Praca<h2>{minToText(totals.work)}</h2></div><div className="card">Dojazdy<h2>{minToText(totals.travel)}</h2></div><div className="card">Nieobecności<h2>{minToText(totals.absence)}</h2></div><div className="card">Brakuje<h2>{minToText(totals.missing)}</h2></div><div className="card">Dni bez wpisów<h2>{totals.no}</h2></div><div className="card">Dni poniżej 8 h<h2>{totals.below}</h2></div></div><div className="card"><h2>Realizacja czasu pracy</h2><div className="tableWrap"><table><thead><tr><th>Data</th><th>Firmy</th><th>Praca</th><th>Dojazd</th><th>Nieobecność</th><th>Rozliczone</th><th>Norma</th><th>Brakuje</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.date} style={{background:r.pending.length>0?'#eef5ff':r.status==='OK'||r.status==='ABSENCE'?'#edf9f1':r.status==='NO_ENTRY'?'#fff0f0':'#fff8e6'}}><td>{r.date}</td><td>{r.companies}</td><td>{minToText(r.work)}</td><td>{minToText(r.travel)}</td><td>{r.absence?minToText(r.absence):'-'}{r.pending.length>0&&<div className="muted">oczekuje: {absenceTypeLabel(r.pending[0].type)}</div>}</td><td><b>{minToText(r.accounted)}</b></td><td>8h 0m</td><td>{r.missing?minToText(r.missing):'-'}</td><td>{r.pending.length>0?'⏳ Oczekuje na akceptację':r.status==='OK'?'✅ OK':r.status==='ABSENCE'?'🏖 Nieobecność':r.status==='NO_ENTRY'?'🔴 Brak wpisu':'⚠️ Poniżej 8 h'}</td></tr>)}</tbody></table></div></div><AbsenceForm data={data} user={user} reload={reload}/><div className="card"><h2>Moje zgłoszenia</h2><div className="tableWrap"><table><thead><tr><th>Rodzaj</th><th>Od</th><th>Do</th><th>Godzin dziennie</th><th>Status</th><th>Uwagi</th><th>Akcje</th></tr></thead><tbody>{mine.map(a=><tr key={a.id}><td>{absenceTypeLabel(a.type)}</td><td>{String(a.dateFrom).slice(0,10)}</td><td>{String(a.dateTo).slice(0,10)}</td><td>{minToText(a.minutes)}</td><td>{absenceStatusLabel(a.status)}</td><td>{a.note||'-'}</td><td>{a.status==='PENDING'?<button className="red" onClick={()=>remove(a)}>Usuń</button>:'-'}</td></tr>)}</tbody></table></div></div></div>
}

function WorkerStatsPanel({ data, reload }) {
 const today=isoToday(); const currentMonth=today.slice(0,7); const initial=monthRange(currentMonth); const [workerId,setWorkerId]=useState('ALL'); const [companyFilter,setCompanyFilter]=useState('ALL'); const [month,setMonth]=useState(currentMonth); const [dateFrom,setDateFrom]=useState(initial.from); const [dateTo,setDateTo]=useState(initial.to); const [editEntry,setEditEntry]=useState(null);
 const selectedUser=(data.users||[]).find(u=>u.id===workerId); function changeMonth(v){setMonth(v);const r=monthRange(v);setDateFrom(r.from);setDateTo(r.to)}
 const companyName=id=>(data.companies||[]).find(c=>c.id===id)?.name||'Firma spoza listy';
 const workerName=e=>e.user?.name||(data.users||[]).find(u=>u.id===e.userId)?.name||'Nieznany pracownik';
 const allEntries=useMemo(()=>[...(data.workEntries||[]).map(e=>({...e,entryKind:'WORK'})),...(data.extraOrders||[]).map(e=>({...e,entryKind:'EXTRA'}))].map(e=>({...e,worker:workerName(e),company:companyName(e.companyId),dateText:String(e.date||'').slice(0,10)})),[data]);
 const entries=allEntries.filter(e=>(workerId==='ALL'||e.userId===workerId)&&(!dateFrom||e.dateText>=dateFrom)&&(!dateTo||e.dateText<=dateTo)&&(companyFilter==='ALL'||e.companyId===companyFilter)).sort((a,b)=>b.dateText.localeCompare(a.dateText));
 const work=entries.reduce((s,e)=>s+Number(e.minutes||0),0),travel=entries.reduce((s,e)=>s+Number(e.travelMinutes||0),0),companies=new Set(entries.map(e=>e.companyId)).size;
 const rows=workerId==='ALL'?[]:buildDailyReport({entries:data.workEntries,extraOrders:data.extraOrders,absences:data.absences,userId:workerId,dateFrom,dateTo}); const absence=rows.reduce((s,r)=>s+r.absence,0),missing=rows.reduce((s,r)=>s+r.missing,0),required=rows.length*480,daysNo=rows.filter(r=>r.status==='NO_ENTRY').length,daysBelow=rows.filter(r=>r.status==='MISSING').length,daysOk=rows.filter(r=>r.missing===0).length;
 async function updateAbsence(a,status){try{await jsonFetch('/api/absences/'+a.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});await reload()}catch(err){alert(err.message)}} async function deleteAbsence(a){if(!confirm('Usunąć nieobecność?'))return;try{await jsonFetch('/api/absences/'+a.id,{method:'DELETE'});await reload()}catch(err){alert(err.message)}}
 async function deleteEntry(entry){if(!confirm(`Usunąć wpis: ${entry.worker} / ${entry.company}?`))return;try{await jsonFetch((entry.entryKind==='EXTRA'?'/api/extra-orders/':'/api/work/')+entry.id,{method:'DELETE'});await reload()}catch(err){alert(err.message)}}
 return <div className="panel"><h1>Pracownicy</h1><div className="card"><div className="grid2"><Field label="Pracownik"><select value={workerId} onChange={e=>setWorkerId(e.target.value)}><option value="ALL">Wszyscy pracownicy</option>{(data.users||[]).filter(u=>u.active!==false).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Field><Field label="Miesiąc"><input type="month" value={month} onChange={e=>changeMonth(e.target.value)}/></Field><Field label="Data od"><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></Field><Field label="Data do"><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></Field><Field label="Firma"><select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)}><option value="ALL">Wszystkie firmy</option>{(data.companies||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div></div><div className="kpis"><div className="card">Pracownik<h2>{selectedUser?.name||'Wszyscy'}</h2></div><div className="card">Czas pracy<h2>{minToText(work)}</h2></div><div className="card">Dojazdy<h2>{minToText(travel)}</h2></div><div className="card">Nieobecności<h2>{minToText(absence)}</h2></div><div className="card">Rozliczone<h2>{minToText(work+travel+absence)}</h2></div><div className="card">Wymagana norma<h2>{workerId==='ALL'?'-':minToText(required)}</h2></div><div className="card">Brakuje<h2>{workerId==='ALL'?'-':minToText(missing)}</h2></div><div className="card">Firmy<h2>{companies}</h2></div><div className="card">Wpisy<h2>{entries.length}</h2></div></div>{workerId!=='ALL'&&<><div className="card"><h2>Realizacja czasu pracy — {selectedUser?.name}</h2><p><b>Dni OK:</b> {daysOk} &nbsp; <b>Poniżej normy:</b> {daysBelow} &nbsp; <b>Bez wpisu:</b> {daysNo}</p><div className="tableWrap"><table><thead><tr><th>Data</th><th>Firmy</th><th>Wpisy</th><th>Praca</th><th>Dojazd</th><th>Nieobecność</th><th>Łącznie</th><th>Norma</th><th>Brakuje</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.date} style={{background:r.pending.length>0?'#eef5ff':r.missing===0?'#edf9f1':r.status==='NO_ENTRY'?'#fff0f0':'#fff8e6'}}><td>{r.date}</td><td>{r.companies}</td><td>{r.entries}</td><td>{minToText(r.work)}</td><td>{minToText(r.travel)}</td><td>{r.absence?minToText(r.absence):'-'}</td><td><b>{minToText(r.accounted)}</b></td><td>8h 0m</td><td>{r.missing?minToText(r.missing):'-'}</td><td>{r.pending.length>0?'⏳ Oczekuje na akceptację':r.missing===0?'✅ OK':r.status==='NO_ENTRY'?'🔴 Brak wpisu':'⚠️ Poniżej 8 h'}</td></tr>)}</tbody></table></div></div><AbsenceForm data={data} user={{id:workerId}} reload={reload} admin defaultUserId={workerId}/></>}
 <div className="card"><h2>Zgłoszenia nieobecności</h2><div className="tableWrap"><table><thead><tr><th>Pracownik</th><th>Rodzaj</th><th>Od</th><th>Do</th><th>Godzin/dzień</th><th>Status</th><th>Uwagi</th><th>Akcje</th></tr></thead><tbody>{(data.absences||[]).filter(a=>workerId==='ALL'||a.userId===workerId).map(a=><tr key={a.id}><td>{a.user?.name||'-'}</td><td>{absenceTypeLabel(a.type)}</td><td>{String(a.dateFrom).slice(0,10)}</td><td>{String(a.dateTo).slice(0,10)}</td><td>{minToText(a.minutes)}</td><td>{absenceStatusLabel(a.status)}</td><td>{a.note||'-'}</td><td><div className="row">{a.status==='PENDING'&&<><button className="orange" onClick={()=>updateAbsence(a,'APPROVED')}>Akceptuj</button><button className="light" onClick={()=>updateAbsence(a,'REJECTED')}>Odrzuć</button></>}<button className="red" onClick={()=>deleteAbsence(a)}>Usuń</button></div></td></tr>)}</tbody></table></div></div>
 <div className="card"><h2>Wpisy pracy</h2><div className="tableWrap"><table><thead><tr><th>Data</th><th>Pracownik</th><th>Firma</th><th>Źródło</th><th>Typ</th><th>Opis</th><th>Praca</th><th>Dojazd</th><th>Akcje</th></tr></thead><tbody>{entries.map(e=><tr key={`${e.entryKind}-${e.id}`}><td>{e.dateText}</td><td>{e.worker}</td><td>{e.company}</td><td>{e.entryKind==='EXTRA'?'Zlecenie dodatkowe':'Obsługa miesięczna'}</td><td>{e.type}</td><td>{e.description||e.title||'-'}</td><td>{minToText(e.minutes)}</td><td>{minToText(e.travelMinutes)}</td><td><button className="red" onClick={()=>deleteEntry(e)}>Usuń</button></td></tr>)}</tbody></table></div></div></div>
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
