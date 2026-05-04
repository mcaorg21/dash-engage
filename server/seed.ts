import bcrypt from 'bcryptjs';
import { pool, initDb } from './db.js';

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;

async function seed() {
  if (!adminEmail || !adminPassword) {
    throw new Error('Configure ADMIN_EMAIL e ADMIN_PASSWORD para criar o primeiro administrador');
  }
  if (adminPassword.length < 4) {
    throw new Error('ADMIN_PASSWORD deve ter pelo menos 4 caracteres');
  }

  await initDb();
  const hash = await bcrypt.hash(adminPassword, 10);

  await pool.query(
    `INSERT INTO users (email, password_hash, is_admin, is_active, permissions)
     VALUES ($1, $2, true, true, $3)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       is_admin = true,
       is_active = true,
       permissions = EXCLUDED.permissions`,
    [adminEmail, hash, ['usuarios']]
  );

  console.log(`Admin pronto: ${adminEmail}`);
  await pool.end();
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
