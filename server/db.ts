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

    ALTER TABLE mapeamento_tipo_servico ADD COLUMN IF NOT EXISTS ocr_pdf_pattern TEXT;

    DO $$
    BEGIN
      IF to_regclass('public.controle_arquivos_drive') IS NOT NULL THEN
        ALTER TABLE controle_arquivos_drive ADD COLUMN IF NOT EXISTS tipo_servico TEXT;
      END IF;
    END $$;

    DROP FUNCTION IF EXISTS fn_regra_bate(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);
    DROP FUNCTION IF EXISTS fn_classificar_tipo_servico(TEXT, TEXT, TEXT);

    CREATE OR REPLACE FUNCTION fn_regra_bate(
      p_razao_social TEXT,
      p_uf_emitente TEXT,
      p_endereco_tomador TEXT,
      p_ocr_pdf TEXT,
      p_fornecedor_pattern TEXT,
      p_uf_emitente_pattern TEXT,
      p_endereco_tomador_pattern TEXT,
      p_padrao_pessoa_fisica BOOLEAN,
      p_ocr_pdf_pattern TEXT
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
        AND (p_padrao_pessoa_fisica = FALSE OR p_razao_social ~ '[0-9]{6,}\\s*$')
        AND (p_ocr_pdf_pattern IS NULL OR p_ocr_pdf_pattern = '' OR EXISTS (
          SELECT 1 FROM unnest(string_to_array(p_ocr_pdf_pattern, ',')) AS termo
          WHERE BTRIM(termo) <> '' AND p_ocr_pdf ILIKE ('%' || BTRIM(termo) || '%')
        ));
    END;
    $BODY$ LANGUAGE plpgsql IMMUTABLE;

    CREATE OR REPLACE FUNCTION fn_classificar_tipo_servico(
      p_razao_social TEXT,
      p_uf_emitente TEXT,
      p_endereco_tomador TEXT,
      p_ocr_pdf TEXT
    ) RETURNS TEXT AS $BODY$
    DECLARE
      v_tipo TEXT;
    BEGIN
      SELECT m.tipo_servico INTO v_tipo
      FROM mapeamento_tipo_servico m
      WHERE m.ativo = TRUE
        AND fn_regra_bate(p_razao_social, p_uf_emitente, p_endereco_tomador, p_ocr_pdf, m.fornecedor_pattern, m.uf_emitente_pattern, m.endereco_tomador_pattern, m.padrao_pessoa_fisica, m.ocr_pdf_pattern)
      ORDER BY m.prioridade ASC, m.id ASC
      LIMIT 1;

      RETURN COALESCE(v_tipo, 'Demais Servicos');
    END;
    $BODY$ LANGUAGE plpgsql STABLE;

    CREATE OR REPLACE FUNCTION trg_classificar_tipo_servico() RETURNS TRIGGER AS $BODY$
    BEGIN
      NEW.tipo_servico := fn_classificar_tipo_servico(NEW.razao_social_emitente, NEW.cidade_uf_emitente, NEW.endereco_tomador, NEW.ocr_pdf);
      RETURN NEW;
    END;
    $BODY$ LANGUAGE plpgsql;

    DO $$
    BEGIN
      IF to_regclass('public.controle_arquivos_drive') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_controle_arquivos_drive_tipo_servico ON controle_arquivos_drive;
        CREATE TRIGGER trg_controle_arquivos_drive_tipo_servico
          BEFORE INSERT OR UPDATE OF razao_social_emitente, cidade_uf_emitente, endereco_tomador, ocr_pdf
          ON controle_arquivos_drive
          FOR EACH ROW
          EXECUTE FUNCTION trg_classificar_tipo_servico();
      END IF;
    END $$;

    CREATE OR REPLACE FUNCTION public.calcular_canal_de_venda(p_razao_social_emitente text, p_cnpj_tomador text, p_valor_liquido numeric)
    RETURNS text
    LANGUAGE plpgsql
    IMMUTABLE
    AS $BODY$
    DECLARE
        v_razao  TEXT;
        v_cnpj   TEXT;
        v_sufixo TEXT;
    BEGIN
        v_razao := UPPER(TRIM(COALESCE(p_razao_social_emitente, '')));
        v_cnpj := REGEXP_REPLACE(COALESCE(p_cnpj_tomador, ''), '[^0-9]', '', 'g');
        v_sufixo := RIGHT(v_cnpj, 6);

        RETURN CASE
            WHEN v_razao ~ '\\mWEBCONTINENTAL\\M' THEN 'WEBCONTINENTAL'
            WHEN (v_razao ~ '\\mTIKTOK\\M' OR v_razao ~ '\\mBYTEDANCE\\M') THEN 'TIKTOK'
            WHEN v_razao ~ '\\mKABUM\\M' THEN 'KABUM'
            WHEN v_razao ~ '\\mCARREFOUR\\M' THEN 'CARREFOUR'
            WHEN v_razao ~ '\\mFAST SHOP\\M' THEN 'FAST SHOP'
            WHEN v_razao ~ '\\mLEROY MERLIN\\M' THEN 'LEROY MERLIN'
            WHEN v_razao ~ '\\mMADEIRA MADEIRA\\M' THEN 'MADEIRA MADEIRA'
            WHEN v_razao ~ '^MARTINS\\M' THEN 'MARTINS'
            WHEN (v_razao ~ '\\mSHEIN\\M' OR v_razao ~ '\\mGLOW\\M') THEN 'SHEIN'
            WHEN v_razao ~ '\\mSHOPEE\\M' THEN 'SHOPEE'
            WHEN (v_razao ~ '\\mCNOVA\\M' OR v_razao ~ '\\mVIA VAREJO\\M' OR v_razao ~ '\\mCASAS BAHIA\\M') THEN 'VIA VAREJO'
            WHEN v_razao ~ '\\mAMAZON\\M' THEN
                CASE v_sufixo
                    WHEN '000101' THEN 'AMAZON'
                    WHEN '000284' THEN 'AMAZON DBA'
                    WHEN '000799' THEN 'AMAZON JUNDIAÍ'
                    WHEN '000870' THEN 'AMAZON EXTREMA'
                    ELSE 'NÃO SE APLICA'
                END
            WHEN (v_razao ~ '\\mMAGAZINE LUIZA\\M' OR v_razao ~ '\\mMAGALU\\M') THEN
                CASE v_sufixo
                    WHEN '000101' THEN 'MAGALU INFO'
                    WHEN '000284' THEN 'MAGALU ELETRO'
                    WHEN '000870' THEN 'MAGALU EXTREMA'
                    ELSE 'NÃO SE APLICA'
                END
            WHEN (v_razao ~ '\\mAMERICANAS\\M' OR v_razao ~ '\\mB2W\\M') THEN
                CASE v_sufixo
                    WHEN '000101' THEN 'B2W MATRIZ'
                    WHEN '000870' THEN 'B2W EXTREMA'
                    ELSE 'NÃO SE APLICA'
                END
            WHEN (v_razao ~ '\\mMERCADO LIVRE\\M' OR v_razao ~ '\\mEBAZAR\\M' OR v_razao ~ '\\mMERCADO PAGO\\M' OR v_razao ~ '\\mMERCADOPAGO\\M') THEN
                CASE v_sufixo
                    WHEN '000284' THEN 'MERCADO LIVRE'
                    WHEN '000101' THEN 'REVISAR - ENDEREÇO DO TOMADOR'
                    ELSE 'NÃO SE APLICA'
                END
            WHEN v_razao ~ '\\mLOJA INTEGRADA\\M' THEN
                CASE
                    WHEN p_valor_liquido IS NULL THEN 'REVISAR - VALOR LÍQUIDO AUSENTE'
                    ELSE 'REVISAR - COMPARAÇÃO DE VALOR'
                END
            ELSE 'NÃO SE APLICA'
        END;
    END;
    $BODY$;

    CREATE OR REPLACE FUNCTION public.calcular_canal_de_venda(p_razao_social_emitente text, p_cnpj_tomador text, p_valor_liquido numeric, p_endereco_tomador text)
    RETURNS text
    LANGUAGE plpgsql
    IMMUTABLE
    AS $BODY$
    DECLARE
        v_razao    TEXT;
        v_cnpj     TEXT;
        v_sufixo   TEXT;
        v_endereco TEXT;
    BEGIN
        v_razao := UPPER(TRIM(COALESCE(p_razao_social_emitente, '')));
        v_cnpj := REGEXP_REPLACE(COALESCE(p_cnpj_tomador, ''), '[^0-9]', '', 'g');
        v_sufixo := RIGHT(v_cnpj, 6);
        v_endereco := UPPER(TRIM(COALESCE(p_endereco_tomador, '')));

        IF v_razao ~ '\\mWEBCONTINENTAL\\M' THEN RETURN 'WEBCONTINENTAL';
        ELSIF (v_razao ~ '\\mTIKTOK\\M' OR v_razao ~ '\\mBYTEDANCE\\M') THEN RETURN 'TIKTOK';
        ELSIF v_razao ~ '\\mKABUM\\M' THEN RETURN 'KABUM';
        ELSIF v_razao ~ '\\mCARREFOUR\\M' THEN RETURN 'CARREFOUR';
        ELSIF v_razao ~ '\\mFAST SHOP\\M' THEN RETURN 'FAST SHOP';
        ELSIF v_razao ~ '\\mLEROY MERLIN\\M' THEN RETURN 'LEROY MERLIN';
        ELSIF (v_razao ~ '\\mMADEIRA MADEIRA\\M' OR v_razao ~ '\\mMADEIRAMADEIRA\\M') THEN RETURN 'MADEIRA MADEIRA';
        ELSIF v_razao ~ '^MARTINS\\M' THEN RETURN 'MARTINS';
        ELSIF (v_razao ~ '\\mSHEIN\\M' OR v_razao ~ '\\mGLOW\\M') THEN RETURN 'SHEIN';
        ELSIF v_razao ~ '\\mSHOPEE\\M' THEN RETURN 'SHOPEE';
        ELSIF (v_razao ~ '\\mCNOVA\\M' OR v_razao ~ '\\mVIA VAREJO\\M' OR v_razao ~ '\\mCASAS BAHIA\\M') THEN RETURN 'VIA VAREJO';
        ELSIF (v_razao ~ '\\mMERCADO LIVRE\\M' OR v_razao ~ '\\mMERCADOLIVRE\\M' OR v_razao ~ '\\mEBAZAR\\M' OR v_razao ~ '\\mMERCADO PAGO\\M' OR v_razao ~ '\\mMERCADOPAGO\\M') THEN
            IF (v_sufixo = '000284' AND (v_endereco LIKE '%SERRA%' OR v_endereco LIKE '%29161-389%' OR v_endereco LIKE '%29161389%')) THEN RETURN 'MERCADO LIVRE';
            ELSIF (v_sufixo = '000101' AND (v_endereco LIKE '%ALAMEDA%' OR v_endereco LIKE '%PLEIADES%' OR v_endereco LIKE '%PLÊIADES%' OR v_endereco LIKE '%30494-270%' OR v_endereco LIKE '%30494270%')) THEN RETURN 'MERCADO LIVRE FULFILLMENT';
            ELSIF (v_sufixo = '000101' AND (v_endereco LIKE '%SERRA%' OR v_endereco LIKE '%29161-389%' OR v_endereco LIKE '%29161389%')) THEN RETURN 'MERCADO LIVRE OUTLET';
            ELSE RETURN 'NÃO SE APLICA';
            END IF;
        ELSIF v_razao ~ '\\mAMAZON\\M' THEN
            RETURN CASE v_sufixo
                WHEN '000101' THEN 'AMAZON'
                WHEN '000284' THEN 'AMAZON DBA'
                WHEN '000799' THEN 'AMAZON JUNDIAÍ'
                WHEN '000870' THEN 'AMAZON EXTREMA'
                ELSE 'NÃO SE APLICA'
            END;
        ELSIF (v_razao ~ '\\mMAGAZINE LUIZA\\M' OR v_razao ~ '\\mMAGALU\\M') THEN
            RETURN CASE v_sufixo
                WHEN '000101' THEN 'MAGALU INFO'
                WHEN '000284' THEN 'MAGALU ELETRO'
                WHEN '000870' THEN 'MAGALU EXTREMA'
                ELSE 'NÃO SE APLICA'
            END;
        ELSIF (v_razao ~ '\\mAMERICANAS\\M' OR v_razao ~ '\\mB2W\\M') THEN
            RETURN CASE v_sufixo
                WHEN '000101' THEN 'B2W MATRIZ'
                WHEN '000870' THEN 'B2W EXTREMA'
                ELSE 'NÃO SE APLICA'
            END;
        ELSIF v_razao ~ '\\mLOJA INTEGRADA\\M' THEN
            IF p_valor_liquido IS NULL THEN RETURN 'NÃO SE APLICA';
            ELSE RETURN 'REVISAR - COMPARAÇÃO DE VALOR';
            END IF;
        ELSE RETURN 'NÃO SE APLICA';
        END IF;
    END;
    $BODY$;

    CREATE OR REPLACE FUNCTION public.trg_preencher_canal_de_venda() RETURNS TRIGGER AS $BODY$
    BEGIN
      NEW.canal_de_venda := calcular_canal_de_venda(
        NEW.razao_social_emitente,
        NEW.cnpj_tomador,
        NEW.valor_liquido,
        NEW.endereco_tomador
      );
      RETURN NEW;
    END;
    $BODY$ LANGUAGE plpgsql;

    DO $$
    BEGIN
      IF to_regclass('public.controle_arquivos_drive') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_controle_arquivos_drive_canal_de_venda ON controle_arquivos_drive;
        CREATE TRIGGER trg_controle_arquivos_drive_canal_de_venda
          BEFORE INSERT OR UPDATE OF razao_social_emitente, cnpj_tomador, valor_liquido, endereco_tomador
          ON controle_arquivos_drive
          FOR EACH ROW
          EXECUTE FUNCTION trg_preencher_canal_de_venda();
      END IF;
    END $$;
  `);

  console.log('Database initialized');
}
