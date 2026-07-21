import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { authenticate, requireAdmin, type AuthRequest } from '../middleware/auth.js';

const DEFAULT_PERMISSIONS: string[] = [];
const PROTECTED_EMAILS = (process.env.PROTECTED_ADMIN_EMAILS || '')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

const router = Router();

router.use(authenticate);

router.get('/', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT email, is_admin, is_active, permissions, created_at FROM users ORDER BY is_admin DESC, email ASC'
    );
    res.json(result.rows.map(u => ({
      email: u.email,
      isAdmin: u.is_admin,
      isActive: u.is_active,
      permissions: u.permissions,
    })));
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/', requireAdmin, async (req: AuthRequest, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'E-mail e senha sao obrigatorios' });
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();
  if (String(password).length < 4) {
    res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });
    return;
  }

  try {
    const exists = await pool.query('SELECT email FROM users WHERE email = $1', [cleanEmail]);
    if (exists.rows.length > 0) {
      res.status(409).json({ error: 'Usuario ja existe' });
      return;
    }

    const hash = await bcrypt.hash(String(password), 10);
    await pool.query(
      'INSERT INTO users (email, password_hash, is_admin, is_active, permissions) VALUES ($1,$2,$3,$4,$5)',
      [cleanEmail, hash, false, true, DEFAULT_PERMISSIONS]
    );

    res.status(201).json({ message: 'Usuario criado com sucesso', email: cleanEmail });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/:email', requireAdmin, async (req: AuthRequest, res) => {
  const targetEmail = decodeURIComponent(String(req.params.email)).toLowerCase();
  const { permissions, isAdmin, isActive } = req.body;

  if (PROTECTED_EMAILS.includes(targetEmail) && isAdmin === false) {
    res.status(403).json({ error: 'Nao e possivel remover admin deste usuario protegido' });
    return;
  }

  try {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (Array.isArray(permissions)) {
      updates.push(`permissions = $${idx++}`);
      values.push(permissions);
    }
    if (typeof isAdmin === 'boolean') {
      updates.push(`is_admin = $${idx++}`);
      values.push(isAdmin);
    }
    if (typeof isActive === 'boolean') {
      updates.push(`is_active = $${idx++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }

    values.push(targetEmail);
    const result = await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE email = $${idx}`, values);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Usuario nao encontrado' });
      return;
    }

    res.json({ message: 'Usuario atualizado com sucesso' });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/:email/password', requireAdmin, async (req: AuthRequest, res) => {
  const targetEmail = decodeURIComponent(String(req.params.email)).toLowerCase();
  const { newPassword } = req.body;

  if (!newPassword || String(newPassword).length < 4) {
    res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });
    return;
  }

  try {
    const hash = await bcrypt.hash(String(newPassword), 10);
    const result = await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, targetEmail]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Usuario nao encontrado' });
      return;
    }
    res.json({ message: 'Senha redefinida com sucesso' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.delete('/:email', requireAdmin, async (req: AuthRequest, res) => {
  const targetEmail = decodeURIComponent(String(req.params.email)).toLowerCase();

  if (PROTECTED_EMAILS.includes(targetEmail)) {
    res.status(403).json({ error: 'Nao e possivel remover este usuario administrador protegido' });
    return;
  }
  if (targetEmail === req.userEmail) {
    res.status(403).json({ error: 'Nao e possivel remover o proprio usuario' });
    return;
  }

  try {
    const result = await pool.query('DELETE FROM users WHERE email = $1', [targetEmail]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Usuario nao encontrado' });
      return;
    }
    res.json({ message: 'Usuario removido com sucesso' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
