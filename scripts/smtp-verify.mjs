// Проверяет, что Yandex SMTP принимает наши креды (без отправки письма).
import 'dotenv/config';
import { createTransport } from 'nodemailer';

const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`✗ ${key} не задан в .env`);
    process.exit(1);
  }
}

const t = createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

console.log(`→ SMTP ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} as ${process.env.SMTP_USER}`);
try {
  await t.verify();
  console.log('✓ SMTP credentials OK — соединение и авторизация прошли');
} catch (err) {
  console.error('✗ verify failed:', err.message);
  if (err.code) console.error('  code:', err.code);
  if (err.response) console.error('  response:', err.response);
  process.exit(2);
}
