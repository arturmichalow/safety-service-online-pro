import { prisma } from '../../../../lib/prisma';
import crypto from 'crypto';

export async function POST(req) {
  try {
    const form = await req.formData();
    const email = String(form.get('email') || '').trim().toLowerCase();

    if (!email) {
      return Response.redirect(new URL('/login?reset=1', req.url));
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (user && user.active) {
      const token = crypto.randomBytes(32).toString('hex');

      await prisma.passwordResetToken.create({
        data: {
          email,
          token,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60)
        }
      });

      console.log('RESET PASSWORD TOKEN:', token);
      console.log('RESET PASSWORD EMAIL:', email);
    }

    return Response.redirect(new URL('/login?reset=1', req.url));
  } catch (err) {
    console.error('FORGOT_PASSWORD_ERROR:', err);

    return Response.json(
      { error: 'Błąd resetowania hasła', details: String(err.message || err) },
      { status: 500 }
    );
  }
}
