import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as gmail from '../services/gmail.js';

const router = Router();

// Status (auth required).
router.get('/status', requireAuth, (req, res) => {
  res.json(gmail.getStatus());
});

// Start OAuth: returns the Google consent URL (auth required).
router.get('/oauth/url', requireAuth, (req, res) => {
  try {
    res.json({ url: gmail.getAuthUrl() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// OAuth callback (NO auth middleware: Google redirects the browser here).
router.get('/oauth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.status(400).send(`Erro de autorização: ${error}`);
  if (!code) return res.status(400).send('Código de autorização ausente.');
  try {
    const result = await gmail.handleOAuthCallback(code);
    res.send(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">` +
        `<title>Gmail conectado</title></head><body style="font-family:system-ui;padding:40px">` +
        `<h2>✅ Gmail conectado</h2>` +
        `<p>Conta: <strong>${result.email || 'desconhecida'}</strong></p>` +
        `<p>Você já pode fechar esta aba e voltar ao Simula Escola IA.</p>` +
        `<script>setTimeout(()=>window.close(),2500)</script></body></html>`,
    );
  } catch (err) {
    res.status(500).send(`Falha ao conectar Gmail: ${err.message}`);
  }
});

// Test connection (auth required).
router.post('/test', requireAuth, async (req, res) => {
  try {
    const info = await gmail.testConnection();
    res.json({ ok: true, ...info });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/disconnect', requireAuth, (req, res) => {
  gmail.disconnect();
  res.json({ ok: true });
});

export default router;
