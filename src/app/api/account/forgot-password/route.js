import { prisma } from '../../../../lib/prisma';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

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

      const appUrl =
        process.env.APP_URL ||
        'https://safety-service-online-pro-production.up.railway.app';

      const resetLink = `${appUrl}/reset-password?token=${token}`;

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Reset hasła — Safety Service',
        html: `
          <div style="font-family:Arial,sans-serif;padding:20px">
            <h2>Reset hasła</h2>
            <p>Otrzymaliśmy prośbę o reset hasła do aplikacji Safety Service.</p>
            <p>Kliknij poniższy link, aby ustawić nowe hasło:</p>
            <p>
              <a href="${resetLink}" style="background:#ff5a1f;color:white;padding:12px 18px;text-decoration:none;border-radius:8px;display:inline-block">
                Ustaw nowe hasło
              </a>
            </p>
            <p>Link jest ważny przez 1 godzinę.</p>
            <p>Jeżeli to nie Ty wysłałeś prośbę, zignoruj tę wiadomość.</p>
          </div>
        `
      });
    }

    return Response.redirect(new URL('/login?reset=1', req.url));
  } catch (err) {
    console.error('FORGOT_PASSWORD_ERROR:', err);

    return Response.json(
      {
        error: 'Błąd resetowania hasła',
        details: String(err.message || err)
      },
      { status: 500 }
    );
  }
}
