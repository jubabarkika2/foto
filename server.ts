import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON with a larger limit to accommodate base64 images
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ limit: "25mb", extended: true }));

  // API Route: check backend status and if SMTP credentials are set
  app.get("/api/config-status", (req, res) => {
    const hasSmtp = !!(
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_HOST
    );
    res.json({
      status: "ok",
      hasSmtp,
      smtpUser: process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 3)}...` : null
    });
  });

  // API Route: Send photo directly via backend SMTP configured by environment variables
  app.post("/api/send-email", async (req, res) => {
    const { to, subject, body, imageBase64 } = req.body;

    if (!to || !subject || !imageBase64) {
      res.status(400).json({ error: "Parâmetros 'to', 'subject' e 'imageBase64' são obrigatórios." });
      return;
    }

    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      res.status(501).json({
        error: "Servidor não configurado com SMTP. Configure as variáveis de ambiente SMTP_USER e SMTP_PASS."
      });
      return;
    }

    try {
      // Setup Nodemailer transport
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true for 465, false for others
        auth: {
          user,
          pass,
        },
      });

      // Extract raw base64 data and mime type
      const match = imageBase64.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
      const mimeType = match ? match[1] : "image/jpeg";
      const base64Data = match ? match[2] : imageBase64;

      const extension = mimeType.split("/")[1] || "jpg";
      const fileName = `foto_capturada_${Date.now()}.${extension}`;

      const mailOptions = {
        from: `"Foto para E-mail" <${user}>`,
        to,
        subject,
        text: body || "Foto enviada pelo aplicativo Foto para E-mail.",
        attachments: [
          {
            filename: fileName,
            content: base64Data,
            encoding: "base64",
            contentType: mimeType
          }
        ]
      };

      const info = await transporter.sendMail(mailOptions);
      console.log("Email sent successfully: %s", info.messageId);

      res.json({ success: true, messageId: info.messageId });
    } catch (err: any) {
      console.error("Error sending email through Nodemailer:", err);
      res.status(500).json({
        error: `Falha ao enviar e-mail: ${err.message || err}`
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
