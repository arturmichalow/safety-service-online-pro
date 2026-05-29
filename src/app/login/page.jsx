import { redirect } from 'next/navigation';
import { prisma } from '../../lib/prisma';
import { verifyPassword, setSession } from '../../lib/auth';

async function login(formData) {
  'use server';

  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user || !user.active) {
    redirect('/login?error=1');
  }

  const ok = await verifyPassword(password, user.passwordHash);

  if (!ok) {
    redirect('/login?error=1');
  }

  setSession(user);

  redirect('/');
}
<div style={{textAlign:'center',marginTop:'15px'}}>
  <a href="/forgot-password">
    Nie pamiętasz hasła?
  </a>
</div>
export default function LoginPage({ searchParams }) {
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

        {searchParams?.error && (
          <div
            style={{
              background: '#ffe5e5',
              color: '#c62828',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '15px',
              textAlign: 'center',
              fontWeight: 'bold'
            }}
          >
            Nieprawidłowy adres e-mail lub hasło.
          </div>
        )}

        <input
          name="email"
          type="email"
          placeholder="Adres email"
          required
        />

        <input
          name="password"
          type="password"
          placeholder="Hasło"
          required
        />

                <button
          className="orange"
          style={{ width: '100%', marginTop: 10 }}
        >
          Zaloguj
        </button>

        <div style={{ textAlign: 'center', marginTop: '18px' }}>
          <a href="/forgot-password" style={{ color: '#ff5a14', fontWeight: 'bold' }}>
            Nie pamiętasz hasła?
          </a>
        </div>
     <button
  className="orange"
  style={{ width: '100%', marginTop: 10 }}
>
  Zaloguj
</button>

<a
  href="/forgot-password"
  style={{
    display: 'block',
    width: '100%',
    marginTop: '14px',
    padding: '12px',
    textAlign: 'center',
    borderRadius: '8px',
    background: '#132734',
    color: 'white',
    fontWeight: 'bold',
    textDecoration: 'none'
  }}
>
  Nie pamiętasz hasła?
</a>
      </form>
    </div>
  );
}
