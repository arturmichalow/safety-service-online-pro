import { prisma } from '../../../lib/prisma';
import { currentUser } from '../../../lib/auth';

export async function GET() {
  const user = await currentUser();

  if (!user) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const notes = await prisma.quickNote.findMany({
    where: {
      userId: user.id
    },
    include: {
      company: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return Response.json(notes);
}

export async function POST(req) {
  const user = await currentUser();

  if (!user) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const body = await req.json();
  const content = String(body.content || '').trim();

  if (!content) {
    return Response.json(
      { error: 'Wpisz treść notatki.' },
      { status: 400 }
    );
  }

  const note = await prisma.quickNote.create({
    data: {
      content,
      status: 'OPEN',
      userId: user.id,
      companyId: body.companyId || null
    },
    include: {
      company: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'CREATE',
      entity: 'QuickNote',
      entityId: note.id,
      after: note
    }
  });

  return Response.json(note);
}
