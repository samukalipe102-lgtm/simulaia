// Server-Sent Events (SSE) para atualização em tempo real do painel.
// Autenticação via query token (EventSource não envia headers customizados).
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { onEvent } from '../services/events.js';

const router = Router();

router.get('/', (req, res) => {
  // EventSource não permite Authorization header → aceita ?token=...
  const token = req.query.token;
  try {
    jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`event: ready\ndata: {"ok":true}\n\n`);

  const unsubscribe = onEvent((e) => {
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  });

  // Heartbeat para manter a conexão viva através de proxies.
  const hb = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(hb);
    unsubscribe();
  });
});

export default router;
