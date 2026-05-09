import { currentUser } from '../../../../lib/auth';
export async function POST(){const user=currentUser();if(!user||user.role!=='ADMIN')return Response.json({error:'Forbidden'},{status:403});return Response.json({ok:true,note:'Ekran importu gotowy. Pełne mapowanie XLSX: Nazwa firmy/NIP/Kwota/Uwagi można dopiąć w następnym kroku.'})}
