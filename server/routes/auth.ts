import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { authenticate, JWT_SECRET, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'E-mail e senha sao obrigatorios' });
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();

  try {
    const result = await pool.query(
      'SELECT email, password_hash, is_admin, is_active, permissions FROM users WHERE email = $1',
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'E-mail ou senha incorretos' });
      return;
    }

    const user = result.rows[0];

    if (!user.is_active) {
      res.status(403).json({ error: 'Usuario desativado. Entre em contato com o administrador.' });
      return;
    }

    const passwordMatch = await bcrypt.compare(String(password), user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'E-mail ou senha incorretos' });
      return;
    }

    const token = jwt.sign(
      { email: user.email, isAdmin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        email: user.email,
        isAdmin: user.is_admin,
        permissions: user.permissions,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      'SELECT email, is_admin, is_active, permissions FROM users WHERE email = $1',
      [req.userEmail]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      res.status(404).json({ error: 'Usuario nao encontrado' });
      return;
    }

    const user = result.rows[0];
    res.json({
      email: user.email,
      isAdmin: user.is_admin,
      permissions: user.permissions,
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/change-password', authenticate, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Senhas sao obrigatorias' });
    return;
  }
  if (String(newPassword).length < 4) {
    res.status(400).json({ error: 'A nova senha deve ter pelo menos 4 caracteres' });
    return;
  }

  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE email = $1', [req.userEmail]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Usuario nao encontrado' });
      return;
    }

    const match = await bcrypt.compare(String(currentPassword), result.rows[0].password_hash);
    if (!match) {
      res.status(401).json({ error: 'Senha atual incorreta' });
      return;
    }

    const hash = await bcrypt.hash(String(newPassword), 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, req.userEmail]);
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
