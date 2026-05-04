CREATE TABLE IF NOT EXISTS users (
  email         VARCHAR(255) PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  is_admin      BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  permissions   TEXT[]       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);
