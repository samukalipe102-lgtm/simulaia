import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, log } from '../db/index.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    log('warn', 'auth', `Tentativa de login inválida: ${email}`);
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }
  const token = signToken(user);
  log('info', 'auth', `Login bem-sucedido: ${email}`);
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.sub, email: req.user.email, role: req.user.role } });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'A nova senha deve ter ao menos 8 caracteres.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!user || !bcrypt.compareSync(currentPassword || '', user.password_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  log('info', 'auth', `Senha alterada: ${user.email}`);
  res.json({ ok: true });
});

export default router;
