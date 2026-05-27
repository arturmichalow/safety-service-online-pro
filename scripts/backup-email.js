const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

async function sendBackup() {
  try {
    const backupContent = `
SAFETY SERVICE BACKUP
Data: ${new Date().toISOString()}

To jest automatyczny backup systemu.
Railway PostgreSQL działa poprawnie.
`;

    const backupPath = path.join(__dirname, "backup.txt");

    fs.writeFileSync(backupPath, backupContent);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
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

    console.log("Backup wysłany.");
  } catch (err) {
    console.error(err);
  }
}

sendBackup();
