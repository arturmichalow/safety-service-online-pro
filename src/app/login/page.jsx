import { redirect } from 'next/navigation';
import { prisma } from '../../lib/prisma';
import { verifyPassword, setSession } from '../../lib/auth';

async function login(formData) {
  'use server';

  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');

  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user || !user.active) return;

  const ok = await verifyPassword(password, user.passwordHash);

  if (!ok) return;

  setSession(user);

  redirect('/');
}

export default function LoginPage() {
  return (
    <div className="login">
      <form className="loginBox" action={login}>

        <img
          src="/logo.png"
          style={{
            width: '320px',
            height: 'auto',
            marginBottom: '30px',
            display: 'block',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}
          alt="Safety Service"
        />

        <h1
          style={{
            textAlign: 'center',
            marginBottom: '25px'
          }}
        >
          Logowanie
        </h1>

        <input
          name="email"
          type="email"
          placeholder="Adres email"
        />

        <input
          name="password"
          type="password"
          placeholder="Hasło"
        />

        <button
          className="orange"
          style={{ width: '100%', marginTop: 10 }}
        >
          Zaloguj
        </button>
      </form>
    </div>
  );
}
