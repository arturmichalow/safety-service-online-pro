import { prisma } from '../../../../lib/prisma';
import { currentUser } from '../../../../lib/auth';

export async function DELETE(req, { params }) {
  try {
    const user = await currentUser();

    if (!user) {
      return Response.json(
        { error: 'Brak autoryzacji.' },
        { status: 401 }
      );
    }

    const note = await prisma.quickNote.findUnique({
      where: {
        id: params.id
      }
    });

    if (!note) {
      return Response.json(
        { error: 'Nie znaleziono notatki.' },
        { status: 404 }
      );
    }

    if (note.userId !== user.id && user.role !== 'ADMIN') {
      return Response.json(
        { error: 'Nie masz uprawnień do usunięcia tej notatki.' },
        { status: 403 }
      );
    }

    await prisma.quickNote.delete({
      where: {
        id: params.id
      }
    });

    return Response.json({
      success: true
    });
  } catch (error) {
    console.error('DELETE QUICK NOTE ERROR:', error);

    return Response.json(
      {
        error: error?.message || 'Nie udało się usunąć notatki.'
      },
      { status: 500 }
    );
  }
}
