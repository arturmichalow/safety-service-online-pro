const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
const employees = ["Artur Michałów", "Kamil Ciałowicz", "Grzegorz Kuczaj", "Paulina Stankiewicz", "Paweł Sereda", "Arkadiusz Źrebiec", "Paweł Pędrak"];
const companies = ["AlexanderMann", "Alten", "Alugear", "AMS Film", "ANDERSEN", "APPLY", "ARAS", "Azoty", "DNV", "DNV Assurance", "Henkel", "KION", "MAN Trucks", "Netwrix", "PEGA", "Procter & Gamble", "SimCorp", "STRIPE", "STRYKER", "WizzAir Poland", "WOMAR"];
const adminPerms={dashboard:true,clients:true,employees:true,work:true,ai:true,charts:true,profitCharts:true,import:true,export:true,security:true,users:true,pwa:true};
const workerPerms={work:true,pwa:true};
function emailFor(name){return name.toLowerCase().replaceAll(' ','.').normalize('NFD').replace(/[\u0300-\u036f]/g,'')+'@safety-service.pl'}
async function upsert(email,name,password,role,permissions){return prisma.user.upsert({where:{email},update:{name,passwordHash:await bcrypt.hash(password,10),role,active:true,permissions},create:{email,name,passwordHash:await bcrypt.hash(password,10),role,active:true,permissions}})}
async function main(){
  await upsert('admin@safety-service.pl','Administrator BHP','admin123','ADMIN',adminPerms);
  await upsert('pracownik@safety-service.pl','Pracownik','praca123','WORKER',workerPerms);
  for (const n of employees) await upsert(emailFor(n),n,'praca123',n==='Artur Michałów'?'ADMIN':'WORKER',n==='Artur Michałów'?adminPerms:workerPerms);
  const artur=await prisma.user.findFirst({where:{name:'Artur Michałów'}});
  for (const name of companies) {const ex=await prisma.company.findFirst({where:{name}}); if(!ex) await prisma.company.create({data:{name,serviceType:'BHP',status:'ACTIVE',billingType:'MONTHLY',netAmount:0,assignedUserId:artur?.id}})}
}
main().finally(()=>prisma.$disconnect());
