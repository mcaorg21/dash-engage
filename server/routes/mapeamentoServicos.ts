import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';

const router = Router();

const TIPOS_SERVICO = ['Transporte', 'Telecom', 'Terceirizado', 'Marketplace', 'Demais Servicos'];

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

router.get('/', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(
      'SELECT * FROM mapeamento_tipo_servico ORDER BY prioridade ASC, id ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Mapeamento servicos lista error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/fornecedores', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT DISTINCT razao_social_emitente
      FROM controle_arquivos_drive
      WHERE razao_social_emitente IS NOT NULL AND BTRIM(razao_social_emitente) <> ''
      ORDER BY razao_social_emitente
    `);
    res.json(result.rows.map((r: { razao_social_emitente: string }) => r.razao_social_emitente));
  } catch (err) {
    console.error('Mapeamento servicos fornecedores error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/contagem', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT COALESCE(tipo_servico, 'Nao classificado') AS tipo_servico, COUNT(*)::int AS total
      FROM controle_arquivos_drive
      GROUP BY COALESCE(tipo_servico, 'Nao classificado')
      ORDER BY total DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Mapeamento servicos contagem error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const { tipoServico, fornecedorPattern, ufEmitentePattern, enderecoTomadorPattern, padraoPessoaFisica, prioridade, ativo, observacao } = req.body || {};
    if (!tipoServico || !TIPOS_SERVICO.includes(tipoServico)) {
      res.status(400).json({ error: 'Tipo de servico invalido' });
      return;
    }
    if (!padraoPessoaFisica && !fornecedorPattern && !ufEmitentePattern && !enderecoTomadorPattern) {
      res.status(400).json({ error: 'Informe ao menos um criterio de match' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO mapeamento_tipo_servico (tipo_servico, fornecedor_pattern, uf_emitente_pattern, endereco_tomador_pattern, padrao_pessoa_fisica, prioridade, ativo, observacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tipoServico,
        fornecedorPattern || null,
        ufEmitentePattern || null,
        enderecoTomadorPattern || null,
        Boolean(padraoPessoaFisica),
        Number.isFinite(Number(prioridade)) ? Number(prioridade) : 100,
        ativo === undefined ? true : Boolean(ativo),
        observacao || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Mapeamento servicos create error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'Id invalido' }); return; }

    const { tipoServico, fornecedorPattern, ufEmitentePattern, enderecoTomadorPattern, padraoPessoaFisica, prioridade, ativo, observacao } = req.body || {};
    if (!tipoServico || !TIPOS_SERVICO.includes(tipoServico)) {
      res.status(400).json({ error: 'Tipo de servico invalido' });
      return;
    }
    if (!padraoPessoaFisica && !fornecedorPattern && !ufEmitentePattern && !enderecoTomadorPattern) {
      res.status(400).json({ error: 'Informe ao menos um criterio de match' });
      return;
    }

    const result = await pool.query(
      `UPDATE mapeamento_tipo_servico
       SET tipo_servico = $1, fornecedor_pattern = $2, uf_emitente_pattern = $3, endereco_tomador_pattern = $4,
           padrao_pessoa_fisica = $5, prioridade = $6, ativo = $7, observacao = $8, atualizado_em = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        tipoServico,
        fornecedorPattern || null,
        ufEmitentePattern || null,
        enderecoTomadorPattern || null,
        Boolean(padraoPessoaFisica),
        Number.isFinite(Number(prioridade)) ? Number(prioridade) : 100,
        ativo === undefined ? true : Boolean(ativo),
        observacao || null,
        id,
      ]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Regra nao encontrada' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Mapeamento servicos update error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'Id invalido' }); return; }

    const result = await pool.query('DELETE FROM mapeamento_tipo_servico WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Regra nao encontrada' }); return; }
    res.json({ deleted: id });
  } catch (err) {
    console.error('Mapeamento servicos delete error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/reclassificar', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      UPDATE controle_arquivos_drive
      SET tipo_servico = fn_classificar_tipo_servico(razao_social_emitente, cidade_uf_emitente, endereco_tomador)
    `);
    res.json({ atualizados: result.rowCount });
  } catch (err) {
    console.error('Mapeamento servicos reclassificar error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
