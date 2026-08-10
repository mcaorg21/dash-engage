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
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      email         VARCHAR(255) PRIMARY KEY,
      password_hash VARCHAR(255) NOT NULL,
      is_admin      BOOLEAN      NOT NULL DEFAULT FALSE,
      is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
      permissions   TEXT[]       NOT NULL DEFAULT '{}',
      created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS saved_column_names (
      column_name TEXT        PRIMARY KEY,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS planilhas_conciliadas (
      id             SERIAL        PRIMARY KEY,
      nome_arquivo   TEXT          NOT NULL,
      sigla          TEXT          NOT NULL,
      titulo         TEXT          NOT NULL,
      coluna_cte     TEXT          NOT NULL,
      total_ctes     INTEGER       NOT NULL,
      valor_total    NUMERIC(14,2) NOT NULL,
      sql_retorno    TEXT,
      conciliado_por TEXT,
      conciliado_em  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mapeamento_tipo_servico (
      id                       SERIAL      PRIMARY KEY,
      tipo_servico             TEXT        NOT NULL,
      fornecedor_pattern       TEXT,
      uf_emitente_pattern      TEXT,
      endereco_tomador_pattern TEXT,
      padrao_pessoa_fisica     BOOLEAN     NOT NULL DEFAULT FALSE,
      prioridade               INTEGER     NOT NULL DEFAULT 100,
      ativo                    BOOLEAN     NOT NULL DEFAULT TRUE,
      observacao               TEXT,
      criado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    DO $$
    BEGIN
      IF to_regclass('public.controle_arquivos_drive') IS NOT NULL THEN
        ALTER TABLE controle_arquivos_drive ADD COLUMN IF NOT EXISTS tipo_servico TEXT;
      END IF;
    END $$;

    CREATE OR REPLACE FUNCTION fn_regra_bate(
      p_razao_social TEXT,
      p_uf_emitente TEXT,
      p_endereco_tomador TEXT,
      p_fornecedor_pattern TEXT,
      p_uf_emitente_pattern TEXT,
      p_endereco_tomador_pattern TEXT,
      p_padrao_pessoa_fisica BOOLEAN
    ) RETURNS BOOLEAN AS $BODY$
    BEGIN
      RETURN
        (p_fornecedor_pattern IS NULL OR p_fornecedor_pattern = '' OR p_razao_social ~* (
          (CASE WHEN left(p_fornecedor_pattern, 1) ~ '[[:alnum:]_]' THEN '\\m' ELSE '' END)
          || p_fornecedor_pattern ||
          (CASE WHEN right(p_fornecedor_pattern, 1) ~ '[[:alnum:]_]' THEN '\\M' ELSE '' END)
        ))
        AND (p_uf_emitente_pattern IS NULL OR p_uf_emitente_pattern = '' OR p_uf_emitente ILIKE ('%' || p_uf_emitente_pattern || '%'))
        AND (p_endereco_tomador_pattern IS NULL OR p_endereco_tomador_pattern = '' OR p_endereco_tomador ILIKE ('%' || p_endereco_tomador_pattern || '%'))
        AND (p_padrao_pessoa_fisica = FALSE OR p_razao_social ~ '[0-9]{6,}\\s*$');
    END;
    $BODY$ LANGUAGE plpgsql IMMUTABLE;

    CREATE OR REPLACE FUNCTION fn_classificar_tipo_servico(
      p_razao_social TEXT,
      p_uf_emitente TEXT,
      p_endereco_tomador TEXT
    ) RETURNS TEXT AS $BODY$
    DECLARE
      v_tipo TEXT;
    BEGIN
      SELECT m.tipo_servico INTO v_tipo
      FROM mapeamento_tipo_servico m
      WHERE m.ativo = TRUE
        AND fn_regra_bate(p_razao_social, p_uf_emitente, p_endereco_tomador, m.fornecedor_pattern, m.uf_emitente_pattern, m.endereco_tomador_pattern, m.padrao_pessoa_fisica)
      ORDER BY m.prioridade ASC, m.id ASC
      LIMIT 1;

      RETURN COALESCE(v_tipo, 'Demais Servicos');
    END;
    $BODY$ LANGUAGE plpgsql STABLE;

    CREATE OR REPLACE FUNCTION trg_classificar_tipo_servico() RETURNS TRIGGER AS $BODY$
    BEGIN
      NEW.tipo_servico := fn_classificar_tipo_servico(NEW.razao_social_emitente, NEW.cidade_uf_emitente, NEW.endereco_tomador);
      RETURN NEW;
    END;
    $BODY$ LANGUAGE plpgsql;

    DO $$
    BEGIN
      IF to_regclass('public.controle_arquivos_drive') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_controle_arquivos_drive_tipo_servico ON controle_arquivos_drive;
        CREATE TRIGGER trg_controle_arquivos_drive_tipo_servico
          BEFORE INSERT OR UPDATE OF razao_social_emitente, cidade_uf_emitente, endereco_tomador
          ON controle_arquivos_drive
          FOR EACH ROW
          EXECUTE FUNCTION trg_classificar_tipo_servico();
      END IF;
    END $$;
  `);

  console.log('Database initialized');
}
