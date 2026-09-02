import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';

const router = Router();

async function hasPermission(req: AuthRequest, permission: string) {
  if (req.isAdmin) return true;
  if (!req.userEmail) return false;
  const result = await pool.query(
    'SELECT permissions FROM users WHERE email = $1 AND is_active = true',
    [req.userEmail]
  );
  return result.rows[0]?.permissions?.includes(permission) || false;
}

router.use(authenticate);

router.get('/cnpjs', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_lista');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT DISTINCT cnpj_tomador
      FROM controle_arquivos_drive
      WHERE cnpj_tomador IS NOT NULL AND BTRIM(cnpj_tomador) <> ''
      ORDER BY cnpj_tomador
    `);
    res.json(result.rows.map((r: { cnpj_tomador: string }) => r.cnpj_tomador));
  } catch (err) {
    console.error('NFSe cnpjs error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/canais-venda', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_lista');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT DISTINCT canal_de_venda
      FROM controle_arquivos_drive
      WHERE canal_de_venda IS NOT NULL AND BTRIM(canal_de_venda) <> ''
      ORDER BY canal_de_venda
    `);
    res.json(result.rows.map((r: { canal_de_venda: string }) => r.canal_de_venda));
  } catch (err) {
    console.error('NFSe canais de venda error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/dashboard', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_painel');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const [monthly, canceladasResult] = await Promise.all([
      pool.query(`
        SELECT
          MAKE_DATE(EXTRACT(YEAR FROM data_emissao)::int, EXTRACT(MONTH FROM data_emissao)::int, 1) AS mes,
          COUNT(*) FILTER (WHERE cancelada IS NOT TRUE)::int AS total,
          COALESCE(SUM(valor_liquido) FILTER (WHERE cancelada IS NOT TRUE), 0)::float AS valor_total
        FROM controle_arquivos_drive
        WHERE data_emissao IS NOT NULL
        GROUP BY 1
        ORDER BY 1
      `),
      pool.query(`SELECT COUNT(*)::int AS total_cancelado FROM controle_arquivos_drive WHERE cancelada = true`),
    ]);

    const totalCancelado = Number(canceladasResult.rows[0]?.total_cancelado || 0);

    res.json({
      totalCancelado,
      months: monthly.rows.map(row => ({
        mes: row.mes,
        total: Number(row.total || 0),
        valor_total: Number(row.valor_total || 0),
      })),
    });
  } catch (err) {
    console.error('NFSe dashboard error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/lista', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_lista');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const { numeroNota, chaveNfse, dataInicio, dataFim, cnpjTomador, nomeArquivo, razaoSocialEmitente, campoData, cancelada, canalVenda, tipoServico } = req.query;

    const campoDataColuna = campoData === 'competencia' ? 'competencia_servico' : 'data_emissao';

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (numeroNota) {
      conditions.push(`CAST(numero_nota AS TEXT) ILIKE $${idx++}`);
      values.push(`%${String(numeroNota)}%`);
    }
    if (chaveNfse) {
      conditions.push(`(json_xml->'Nfse'->'InfNfse'->>'CodigoVerificacao') ILIKE $${idx++}`);
      values.push(`%${String(chaveNfse)}%`);
    }
    if (dataInicio) {
      conditions.push(`${campoDataColuna} >= $${idx++}`);
      values.push(String(dataInicio));
    }
    if (dataFim) {
      conditions.push(`${campoDataColuna} <= $${idx++}`);
      values.push(String(dataFim));
    }
    if (cnpjTomador) {
      conditions.push(`cnpj_tomador ILIKE $${idx++}`);
      values.push(`%${String(cnpjTomador)}%`);
    }
    if (nomeArquivo) {
      conditions.push(`nome_arquivo ILIKE $${idx++}`);
      values.push(`%${String(nomeArquivo)}%`);
    }
    if (razaoSocialEmitente) {
      conditions.push(`razao_social_emitente ILIKE $${idx++}`);
      values.push(`%${String(razaoSocialEmitente)}%`);
    }
    if (cancelada === 'true') {
      conditions.push(`cancelada = true`);
    } else if (cancelada === 'false') {
      conditions.push(`cancelada IS NOT TRUE`);
    }
    if (canalVenda) {
      conditions.push(`canal_de_venda = $${idx++}`);
      values.push(String(canalVenda));
    }
    if (tipoServico) {
      conditions.push(`tipo_servico = $${idx++}`);
      values.push(String(tipoServico));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM (
        SELECT DISTINCT ON (numero_nota, cnpj_emitente) *
        FROM controle_arquivos_drive ${where}
        ORDER BY numero_nota, cnpj_emitente, data_emissao DESC NULLS LAST
      ) sub
      ORDER BY data_emissao DESC NULLS LAST
      LIMIT 500`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    console.error('NFSe lista error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/nao-conciliadas/count', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_nao_conciliadas');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM controle_arquivos_drive
      WHERE cancelada IS NOT TRUE AND existe_sysemp = false AND json_xml IS NOT NULL
    `);
    res.json({ total: result.rows[0]?.total ?? 0 });
  } catch (err) {
    console.error('NFSe nao conciliadas count error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/nao-conciliadas', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_nao_conciliadas');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const { numeroNota, chaveNfse, dataInicio, dataFim, cnpjTomador, nomeArquivo, razaoSocialEmitente, canalVenda, tipoServico } = req.query;

    const conditions: string[] = ['cancelada IS NOT TRUE', 'existe_sysemp = false', 'json_xml IS NOT NULL'];
    const values: unknown[] = [];
    let idx = 1;

    if (numeroNota) {
      conditions.push(`CAST(numero_nota AS TEXT) ILIKE $${idx++}`);
      values.push(`%${String(numeroNota)}%`);
    }
    if (chaveNfse) {
      conditions.push(`(json_xml->'Nfse'->'InfNfse'->>'CodigoVerificacao') ILIKE $${idx++}`);
      values.push(`%${String(chaveNfse)}%`);
    }
    if (dataInicio) {
      conditions.push(`data_emissao >= $${idx++}`);
      values.push(String(dataInicio));
    }
    if (dataFim) {
      conditions.push(`data_emissao <= $${idx++}`);
      values.push(String(dataFim));
    }
    if (cnpjTomador) {
      conditions.push(`cnpj_tomador ILIKE $${idx++}`);
      values.push(`%${String(cnpjTomador)}%`);
    }
    if (nomeArquivo) {
      conditions.push(`nome_arquivo ILIKE $${idx++}`);
      values.push(`%${String(nomeArquivo)}%`);
    }
    if (razaoSocialEmitente) {
      conditions.push(`razao_social_emitente ILIKE $${idx++}`);
      values.push(`%${String(razaoSocialEmitente)}%`);
    }
    if (canalVenda) {
      conditions.push(`canal_de_venda = $${idx++}`);
      values.push(String(canalVenda));
    }
    if (tipoServico) {
      conditions.push(`tipo_servico = $${idx++}`);
      values.push(String(tipoServico));
    }

    const result = await pool.query(
      `SELECT * FROM controle_arquivos_drive
       WHERE ${conditions.join(' AND ')}
       ORDER BY data_emissao DESC NULLS LAST, id DESC`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    console.error('NFSe nao conciliadas list error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.patch('/:id/valor-liquido', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_lista');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const id = Number(req.params.id);
    const valorLiquido = Number(req.body?.valorLiquido);
    if (!Number.isFinite(id) || !Number.isFinite(valorLiquido)) {
      res.status(400).json({ error: 'Dados invalidos' });
      return;
    }

    const result = await pool.query(
      'UPDATE controle_arquivos_drive SET valor_liquido = $1 WHERE id = $2 RETURNING valor_liquido',
      [valorLiquido, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Registro nao encontrado' });
      return;
    }
    res.json({ valor_liquido: result.rows[0].valor_liquido });
  } catch (err) {
    console.error('NFSe valor liquido update error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.patch('/:id/canal-venda', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_lista');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const id = Number(req.params.id);
    const canalVenda = typeof req.body?.canalVenda === 'string' ? req.body.canalVenda.trim() : '';
    if (!Number.isFinite(id) || !canalVenda) {
      res.status(400).json({ error: 'Dados invalidos' });
      return;
    }

    const result = await pool.query(
      'UPDATE controle_arquivos_drive SET canal_de_venda = $1 WHERE id = $2 RETURNING canal_de_venda',
      [canalVenda, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Registro nao encontrado' });
      return;
    }
    res.json({ canal_de_venda: result.rows[0].canal_de_venda });
  } catch (err) {
    console.error('NFSe canal de venda update error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
