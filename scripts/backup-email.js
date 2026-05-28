console.log("START BACKUP EMAIL");

const { Resend } = require("resend");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

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

async function main() {
  try {
    const required = ["DATABASE_URL", "RESEND_API_KEY", "BACKUP_TO_EMAIL"];

    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`Brakuje zmiennej: ${key}`);
      }
    }

    const date = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-safety-service-${date}.sql`;
    const backupPath = path.join("/tmp", filename);

    console.log("Robię backup SQL przez pg_dump...");

    await run("pg_dump", [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--file",
      backupPath,
      process.env.DATABASE_URL,
    ]);

    console.log("Backup SQL utworzony:", filename);

    const backupBase64 = fs.readFileSync(backupPath).toString("base64");

    const resend = new Resend(process.env.RESEND_API_KEY);

    console.log("Wysyłam mail z backupem SQL...");

    const { data, error } = await resend.emails.send({
      from: "Safety Service Backup <onboarding@resend.dev>",
      to: [process.env.BACKUP_TO_EMAIL],
      subject: "Backup SQL Safety Service",
      text: "W załączniku znajduje się prawdziwy backup bazy danych PostgreSQL w formacie .sql.",
      attachments: [
        {
          filename,
          content: backupBase64,
        },
      ],
    });

    if (error) {
      console.error("BŁĄD RESEND:");
      console.error(error);
      throw new Error("Resend nie wysłał maila.");
    }

    fs.unlinkSync(backupPath);

    console.log("MAIL WYSŁANY");
    console.log("Resend ID:", data.id);
    console.log("KONIEC BACKUP EMAIL");
  } catch (err) {
    console.error("BŁĄD BACKUPU:");
    console.error(err);
    process.exit(1);
  }
}

main();
