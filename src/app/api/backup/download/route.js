export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { currentUser } from "../../../../lib/auth";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 100 }, (err, stdout, stderr) => {
      if (err) {
        console.error("PG_DUMP ERROR:", stderr || err.message);
        reject(new Error(stderr || err.message));
        return;
      }

      resolve(stdout);
    });
  });
}

export async function GET() {
  try {
    const user = await currentUser();

    if (!user || user.role !== "ADMIN") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!process.env.DATABASE_URL) {
      return Response.json({ error: "Brakuje DATABASE_URL" }, { status: 500 });
    }

    const date = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-safety-service-${date}.sql`;
    const backupPath = path.join("/tmp", filename);

    await run("pg_dump", [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--file",
      backupPath,
      process.env.DATABASE_URL,
    ]);

    const file = fs.readFileSync(backupPath);
    fs.unlinkSync(backupPath);

    return new Response(file, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("BACKUP DOWNLOAD ERROR:", err);

    return Response.json(
      {
        error: "Nie udało się pobrać backupu SQL",
        details: String(err.message || err),
      },
      { status: 500 }
    );
  }
}
