console.log("START BACKUP");

const { Resend } = require("resend");

async function sendBackup() {
  try {
    console.log("Sprawdzanie zmiennych...");

    const required = ["RESEND_API_KEY", "BACKUP_TO_EMAIL"];

    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`Brakuje zmiennej środowiskowej: ${key}`);
      }
    }

    console.log("Tworzenie backupu...");

    const backupContent = `
SAFETY SERVICE BACKUP
Data: ${new Date().toISOString()}

To jest automatyczny backup systemu.
Railway PostgreSQL działa poprawnie.
`;

    const backupBase64 = Buffer.from(backupContent, "utf8").toString("base64");

    console.log("Konfiguracja Resend...");

    const resend = new Resend(process.env.RESEND_API_KEY);

    console.log("WYSYŁAM MAIL...");

    const { data, error } = await resend.emails.send({
      from: "Safety Service Backup <onboarding@resend.dev>",
      to: [process.env.BACKUP_TO_EMAIL],
      subject: "Backup Safety Service",
      text: "Automatyczny backup systemu Safety Service.",
      attachments: [
        {
          filename: "backup.txt",
          content: backupBase64,
        },
      ],
    });

    if (error) {
      console.error("BŁĄD RESEND:");
      console.error(error);
      throw new Error("Resend nie wysłał maila.");
    }

    console.log("MAIL WYSŁANY");
    console.log("Resend ID:", data.id);
    console.log("Backup wysłany poprawnie.");
  } catch (err) {
    console.error("BŁĄD BACKUPU:");
    console.error(err);
    process.exit(1);
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
