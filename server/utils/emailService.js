const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const hasRealCredentials = () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return false;
  if (user.startsWith("your_") || pass.startsWith("your_")) return false;
  return true;
};

const sendEmail = async ({ to, subject, text, html }) => {
  try {
    if (!to) return false;

    if (!hasRealCredentials()) {
      console.warn("[Email] Missing credentials. Simulation only.", {
        to,
        subject,
      });
      return true;
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
      html,
    });

    return true;
  } catch (error) {
    console.error("[Email] Send failed:", error.message);
    return false;
  }
};

module.exports = { sendEmail };

