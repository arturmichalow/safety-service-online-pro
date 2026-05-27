const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function run() {

  const date = new Date().toISOString().split("T")[0];

  const backupDir = path.join(__dirname, "../backups");

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  const file = path.join(
    backupDir,
    `backup-${date}.sql`
  );

  exec(
    `pg_dump "${process.env.DATABASE_URL}" > "${file}"`,
    async (err) => {

      if (err) {
        console.error(err);
        return;
      }

      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.BACKUP_TO_EMAIL,
        subject: `Backup Safety Service ${date}`,
        text: "Automatyczny backup bazy danych.",
        attachments: [
          {
            filename: `backup-${date}.sql`,
            path: file,
          },
        ],
      });

      console.log("Backup wysłany");
    }
  );
}

run();
