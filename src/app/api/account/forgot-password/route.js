import { prisma } from '../../../../../lib/prisma';
import crypto from 'crypto';

export async function POST(req){

  const form = await req.formData();
  const email = String(form.get('email'));

  const user = await prisma.user.findUnique({
    where:{email}
  });

  if(user){

    const token = crypto.randomBytes(32).toString('hex');

    await prisma.passwordResetToken.create({
      data:{
        email,
        token,
        expiresAt:new Date(Date.now()+3600000)
      }
    });

    const link =
      `https://safety-service.app/reset-password?token=${token}`;

    // tutaj wysyłka maila
  }

  return Response.redirect(
    new URL('/login?reset=1',req.url)
  );
}