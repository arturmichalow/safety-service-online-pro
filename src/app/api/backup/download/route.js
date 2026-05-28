import { currentUser } from "../../../../lib/auth";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 100 }, (err, stdout, stderr) => {
      if (err) {
        console.error(stderr);
        reject(err);
      } else {
        resolve(stdout);
      }
    });
  });

export async function GET() {
  const user = await currentUser();

  if (!user || user.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const date = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${date}.sql`;
  const backupPath = path.join("/tmp", filename);

  await run("pg_dump", [
    process.env.DATABASE_URL,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "-f",
    backupPath,
  ]);

  const file = fs.readFileSync(backupPath);
  fs.unlinkSync(backupPath);

  return new Response(file, {
    headers: {
      "Content-Type": "application/sql",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}