console.log("START BACKUP");

const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

async function sendBackup() {
  try {
    console.log("Tworzenie backupu...");

    const backupContent = `
SAFETY SERVICE BACKUP
Data: ${new Date().toISOString()}

To jest automatyczny backup systemu.
Railway PostgreSQL działa poprawnie.
`;

    const backupPath = path.join(__dirname, "backup.txt");

    fs.writeFileSync(backupPath, backupContent);

    console.log("Plik backup.txt utworzony");

    console.log("Konfiguracja SMTP...");

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    console.log("SMTP gotowe");

    console.log("WYSYŁAM MAIL...");

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.BACKUP_TO_EMAIL,
      subject: "Backup Safety Service",
      text: "Automatyczny backup systemu.",
      attachments: [
        {
          filename: "backup.txt",
          path: backupPath,
        },
      ],
    });

    console.log("MAIL WYSŁANY");
    console.log("Message ID:", info.messageId);

    console.log("Usuwanie lokalnego pliku backup...");
    fs.unlinkSync(backupPath);

    console.log("Backup wysłany poprawnie.");
  } catch (err) {
    console.error("BŁĄD BACKUPU:");
    console.error(err);
  }
}

sendBackup()
  .then(() => {
    console.log("KONIEC BACKUP");
    process.exit(0);
  })
  .catch((err) => {
    console.error("FATAL ERROR:");
    console.error(err);
    process.exit(1);
  });
