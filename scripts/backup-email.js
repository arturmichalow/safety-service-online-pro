console.log("START BACKUP EMAIL");

const { Resend } = require("resend");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

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

async function main() {
  const required = ["DATABASE_URL", "RESEND_API_KEY", "BACKUP_TO_EMAIL"];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Brakuje zmiennej: ${key}`);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join("/tmp", `backup-${date}.sql`);

  console.log("Robię pg_dump...");
  await run("pg_dump", [
    process.env.DATABASE_URL,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "-f",
    backupPath,
  ]);

  const backupBase64 = fs.readFileSync(backupPath).toString("base64");

  console.log("Wysyłam mail...");
  const { data, error } = await resend.emails.send({
    from: "Safety Service Backup <onboarding@resend.dev>",
    to: [process.env.BACKUP_TO_EMAIL],
    subject: "Backup bazy Safety Service",
    text: "W załączniku znajduje się backup bazy danych PostgreSQL.",
    attachments: [
      {
        filename: `backup-${date}.sql`,
        content: backupBase64,
      },
    ],
  });

  if (error) throw error;

  fs.unlinkSync(backupPath);

  console.log("MAIL WYSŁANY");
  console.log("Resend ID:", data.id);
  console.log("KONIEC BACKUP EMAIL");
}

main().catch((err) => {
  console.error("BŁĄD BACKUPU:");
  console.error(err);
  process.exit(1);
});
