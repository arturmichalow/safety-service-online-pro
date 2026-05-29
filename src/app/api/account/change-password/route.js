import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req) {
  try {
    const user = await currentUser();

    if (!user) {
      return Response.json({ error: 'Nie jesteś zalogowany.' }, { status: 401 });
    }

    const body = await req.json();

    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    const repeatPassword = String(body.repeatPassword || '');

    if (!currentPassword || !newPassword || !repeatPassword) {
      return Response.json({ error: 'Uzupełnij wszystkie pola.' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return Response.json({ error: 'Nowe hasło musi mieć minimum 6 znaków.' }, { status: 400 });
    }

    if (newPassword !== repeatPassword) {
      return Response.json({ error: 'Nowe hasła nie są takie same.' }, { status: 400 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id }
    });

    if (!dbUser) {
      return Response.json({ error: 'Nie znaleziono użytkownika.' }, { status: 404 });
    }

    const passwordFromDb = dbUser.password || dbUser.passwordHash;

    if (!passwordFromDb) {
      return Response.json({ error: 'Brak pola hasła w bazie użytkownika.' }, { status: 500 });
    }

    const ok = await bcrypt.compare(currentPassword, passwordFromDb);

    if (!ok) {
      return Response.json({ error: 'Aktualne hasło jest nieprawidłowe.' }, { status: 400 });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
  where: { id: user.id },
  data: { passwordHash: hashed }
});

    return Response.json({ ok: true });
  } catch (err) {
    console.error('CHANGE_PASSWORD_ERROR:', err);
    return Response.json(
      { error: 'Błąd zmiany hasła', details: String(err.message || err) },
      { status: 500 }
    );
  }
}
