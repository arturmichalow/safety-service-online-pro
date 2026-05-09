const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const adminPerms={dashboard:true,clients:true,employees:true,work:true,extraOrders:true,ai:true,charts:true,profitCharts:true,import:true,export:true,security:true,users:true,pwa:true};
const workerPerms={work:true,pwa:true};
const employees = ['Artur Michałów','Kamil Ciałowicz','Grzegorz Kuczaj','Paulina Stankiewicz','Paweł Sereda','Arkadiusz Źrebiec','Paweł Pędrak'];
function emailFor(name){return name.toLowerCase().replaceAll(' ','.').normalize('NFD').replace(/[\u0300-\u036f]/g,'')+'@safety-service.pl'}
async function upsert(email,name,password,role,permissions){return prisma.user.upsert({where:{email},update:{name,passwordHash:await bcrypt.hash(password,10),role,active:true,permissions},create:{email,name,passwordHash:await bcrypt.hash(password,10),role,active:true,permissions}})}

const companies = [
 ['AGH Cyfronet',400,'','Paweł Sereda'],['Alten',7490,'','Paulina Stankiewicz'],['AMS',6190,'PO002271-PL01','Paweł Sereda'],['ANDERSEN',2490,'','Kamil Ciałowicz'],['Apply',2790,'','Kamil Ciałowicz'],['Aras',1990,'','Paweł Pędrak'],['belmeb',2030,'','Grzegorz Kuczaj'],['Bestum Jakub Przeniosło',500,'','Grzegorz Kuczaj'],['cantor',990,'','Kamil Ciałowicz'],['Capital (od kwietnia 2026)',3980,'','Grzegorz Kuczaj'],['CLEANTECH',490,'','Grzegorz Kuczaj'],['Credo',495,'','Paweł Pędrak'],['Dach Perfect',500,'','Grzegorz Kuczaj'],['DNV',4990,'','Paweł Sereda'],['DYNIQ/SWARCO',390,'','Paweł Pędrak'],['Emerson',7490,'','Kamil Ciałowicz'],['FDM',1990,'','Paweł Pędrak'],['FQS (od kwietnia 2026)',990,'','Grzegorz Kuczaj'],['Gamer Workshop',1600,'Mail po angielsku','Kamil Ciałowicz'],['Getinge',4000,'','Paweł Pędrak'],['Giganci Programowania',1750,'','Kamil Ciałowicz'],['Henkel',6800,'','Kamil Ciałowicz'],['HN GLOBAL BUSINESS SERVICES CENTER',3090,'numer zamówienia PO numer - 132902948','Kamil Ciałowicz'],['Huntsman',3990,'','Kamil Ciałowicz'],['IDOM',2000,'','Grzegorz Kuczaj'],['INPOL-KRAK',600,'','Grzegorz Kuczaj'],['INTERVIATECH',950,'','Grzegorz Kuczaj'],['Joanna Barejka',400,'','Grzegorz Kuczaj'],['Kainos',3490,'','Paweł Pędrak'],['Kaseya',2490,'PO #80885','Kamil Ciałowicz'],['KIMBERLY CLARK',5950,'Numer zamówienia:4300767000','Paulina Stankiewicz'],['KIMBERLY CLARK - E000092738',1200,'E000092738','Paulina Stankiewicz'],['Kion',6970,'','Paulina Stankiewicz'],['Koleje Małopolskie',9900,'','Grzegorz Kuczaj'],['MARIOPLUS Sp. z o.o.',500,'','Grzegorz Kuczaj'],['Netwrix',1200,'','Grzegorz Kuczaj'],['NEXI / nets denmark',2190,'','Paulina Stankiewicz'],['P&G',14900,'','Kamil Ciałowicz'],['PAPAK',300,'','Grzegorz Kuczaj'],['PEGASYSTEMS SOFTWARE',3700,'','Paulina Stankiewicz'],['Playbook engineering',745,'','Kamil Ciałowicz'],['Playbook servces',745,'','Kamil Ciałowicz'],['Profi Line oraz inne spółki',9120,'Faktura raz w roku na końcu czerwca','Grzegorz Kuczaj'],['R8',1490,'','Kamil Ciałowicz'],['REHA KRAK',250,'','Paweł Pędrak'],['REMKAN',1500,'','Grzegorz Kuczaj'],['Rippling',1990,'','Paweł Pędrak'],['RKD',1250,'Mail po angielsku','Paweł Pędrak'],['SANO',1090,'','Paweł Pędrak'],['Setec / bakalite',1590,'','Grzegorz Kuczaj'],['SimCorp',3190,'','Kamil Ciałowicz'],['SINTERIT',2200,'','Grzegorz Kuczaj'],['S-NET',150,'','Paweł Pędrak'],['STER KLIM EXECUTION',500,'','Arkadiusz Źrebiec'],['stripe',1090,'','Kamil Ciałowicz'],['Timber Moon',250,'','Arkadiusz Źrebiec'],['TTEC',1690,'','Arkadiusz Źrebiec'],['Tutti Agata Górska',495,'','Paweł Pędrak'],['UI BETEILIGUNGS',1450,'','Paulina Stankiewicz'],['UI EFA',1450,'Mail po angielsku','Paulina Stankiewicz'],['UNIVERSAL INVESTMENT',3105,'','Paulina Stankiewicz'],['VITROFORM',1500,'','Grzegorz Kuczaj'],['WIZZAIR',15600,'Tworzymy fakturę, ale nie wystawiamy jej na maila Wizzair; dopiero około 10 dnia danego miesiąca, gdy Paweł Sereda podeśle dokumenty.','Paweł Sereda'],['WOMAR',500,'','Grzegorz Kuczaj'],['WUOZ',890,'','Paweł Pędrak'],['WAWEL',0,'FV są od czerwca do września plus od czasu do czasu dodatkowe','Paweł Pędrak']
];

async function main(){
  const admin=await upsert('admin@safety-service.pl','Administrator BHP','admin123','ADMIN',adminPerms);
  await upsert('pracownik@safety-service.pl','Pracownik','praca123','WORKER',workerPerms);
  for(const n of employees){await upsert(emailFor(n),n,'praca123',n==='Artur Michałów'?'ADMIN':'WORKER',n==='Artur Michałów'?adminPerms:workerPerms)}
  await prisma.extraOrder.deleteMany({});
  await prisma.workEntry.deleteMany({});
  await prisma.company.deleteMany({});
  const users=await prisma.user.findMany();
  const byName=Object.fromEntries(users.map(u=>[u.name,u.id]));
  for(const [name,amount,uwagi,employee] of companies){
    await prisma.company.create({data:{name,netAmount:amount,extraCostDescription:uwagi||null,serviceType:'BHP',status:'ACTIVE',billingType:'MONTHLY',assignedUserId:byName[employee]||byName['Artur Michałów']||admin.id}})
  }
  await prisma.auditLog.create({data:{userId:admin.id,action:'SEED_COMPANIES_V6_4',entity:'Company',after:{count:companies.length}}});
}
main().finally(()=>prisma.$disconnect());
