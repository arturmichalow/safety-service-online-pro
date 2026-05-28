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

export async function POST(req) {
  const user = await currentUser();

  if (!user || user.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file) {
    return Response.json({ error: "Brak pliku backupu." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const restorePath = path.join("/tmp", `restore-${Date.now()}.sql`);

  fs.writeFileSync(restorePath, buffer);

  await run("psql", [process.env.DATABASE_URL, "-f", restorePath]);

  fs.unlinkSync(restorePath);

  return Response.json({ ok: true, message: "Backup przywrócony." });
}