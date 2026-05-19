import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL nao configurada');
}

export const pool = new Pool({
  connectionString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      email         VARCHAR(255) PRIMARY KEY,
      password_hash VARCHAR(255) NOT NULL,
      is_admin      BOOLEAN      NOT NULL DEFAULT FALSE,
      is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
      permissions   TEXT[]       NOT NULL DEFAULT '{}',
      created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS file_column_mappings (
      file_name      TEXT        PRIMARY KEY,
      column_mapping TEXT        NOT NULL,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('Database initialized');
}
