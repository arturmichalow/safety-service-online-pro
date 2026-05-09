function cleanNip(nip){return String(nip||'').replace(/\D/g,'')}
export async function GET(req,{params}){
  const nip=cleanNip(params.nip);
  if(nip.length!==10) return Response.json({error:'Nieprawidłowy NIP'},{status:400});
  const date=new Date().toISOString().slice(0,10);
  try{
    const url=`https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`;
    const r=await fetch(url,{cache:'no-store'});
    const j=await r.json();
    const s=j?.result?.subject;
    if(!r.ok||!s) return Response.json({error:'Nie znaleziono danych dla NIP'},{status:404});
    return Response.json({name:s.name||'',nip:s.nip||nip,address:s.workingAddress||s.residenceAddress||'',contactPerson:'',phone:'',email:''});
  }catch(e){
    return Response.json({error:'Nie udało się pobrać danych z rejestru NIP'},{status:500});
  }
}
