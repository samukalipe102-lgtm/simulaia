import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { db, migrate, log } from './db/index.js';
import { startScheduler } from './jobs/scheduler.js';

import authRoutes from './routes/auth.js';
import servicesRoutes from './routes/services.js';
import profilesRoutes from './routes/profiles.js';
import requestsRoutes from './routes/requests.js';
import automationsRoutes from './routes/automations.js';
import gmailRoutes from './routes/gmail.js';
import settingsRoutes from './routes/settings.js';
import reportsRoutes from './routes/reports.js';
import edugestaoRoutes from './routes/edugestao.js';
import eventsRoutes from './routes/events.js';
import centralRoutes from './routes/central.js';
import { seedAll } from './services/edugestao.js';

migrate();
// Seed EduGestão catalog (processes + institutional signatures) if empty.
seedAll();

// Ensure the initial admin exists.
function ensureAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(config.adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync(config.adminPassword, 10);
    db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(
      config.adminEmail,
      hash,
      'admin',
    );
    log('info', 'auth', `Administrador inicial criado: ${config.adminEmail}`);
  }
}
ensureAdmin();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin(origin, cb) {
      // Allow non-browser tools (no origin) and configured client origins.
      if (!origin || config.clientOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
  }),
);

app.get('/api/health', (req, res) =>
  res.json({ ok: true, service: 'simula-escola-ia', time: new Date().toISOString() }),
);

app.use('/api/auth', authRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/profiles', profilesRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/automations', automationsRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/edugestao', edugestaoRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/central', centralRoutes);

// API 404 handler (only for /api/* paths).
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// --- Serve the built frontend in production (single-service deploy) ---
// If a build of the client exists, serve it and fall back to index.html so the
// SPA router handles client-side routes. This lets one web service host both
// the API and the UI (ideal for Render/Railway/Fly single-service deploy).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = config.clientDist || path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  log('info', 'scheduler', `Servindo frontend estático de: ${clientDist}`);
} else {
  app.use((req, res) => res.status(404).json({ error: 'Recurso não encontrado.' }));
}

// Only start listening + scheduler when run directly (not under tests).
const isMain = process.argv[1] && process.argv[1].endsWith('index.js');
if (isMain) {
  app.listen(config.port, () => {
    log('info', 'scheduler', `Servidor iniciado na porta ${config.port}.`);
    console.log(`Simula Escola IA backend em http://localhost:${config.port}`);
    startScheduler();
  });
}

export { app };
