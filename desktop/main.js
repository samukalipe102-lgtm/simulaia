// Simula Escola IA — processo principal do Electron (app de desktop Windows).
//
// O que ele faz ao abrir:
//  1. Resolve uma pasta de dados GRAVÁVEL do usuário (userData).
//  2. Garante um arquivo .env lá (cria na 1ª execução, com padrões seguros).
//  3. Sobe o backend (API + agendador + frontend) como processo filho,
//     apontando o banco SQLite e o .env para a pasta do usuário.
//  4. Aguarda o /api/health e abre a janela do app apontando para o backend.
//
// Observação: o agendador roda enquanto o app estiver aberto (ou minimizado).
// Para envio 24h mesmo com o PC desligado, use o deploy em nuvem (DEPLOYMENT.md).

const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const http = require('node:http');

const isDev = !app.isPackaged;
const PORT = 4137; // porta fixa local do backend embutido
const BASE_URL = `http://127.0.0.1:${PORT}`;

let backendProc = null;
let mainWindow = null;
let splashWindow = null;

// --- Caminhos ---------------------------------------------------------------
function userDataDir() {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resourcePaths() {
  if (isDev) {
    // Em desenvolvimento, usa os diretórios do repositório.
    return {
      serverDir: path.resolve(__dirname, '..', 'server'),
      clientDist: path.resolve(__dirname, '..', 'client', 'dist'),
    };
  }
  // Em produção, os recursos vão para process.resourcesPath (extraResources).
  return {
    serverDir: path.join(process.resourcesPath, 'server'),
    clientDist: path.join(process.resourcesPath, 'client-dist'),
  };
}

// --- .env na pasta do usuário ----------------------------------------------
function ensureEnvFile(dataDir) {
  const envPath = path.join(dataDir, '.env');
  if (!fs.existsSync(envPath)) {
    const jwt = crypto.randomBytes(48).toString('hex');
    const content = [
      '# Configuração local do Simula Escola IA (gerado automaticamente).',
      '# As credenciais do Google podem ser preenchidas pela própria interface',
      '# (página "Integração com Gmail"), sem precisar editar este arquivo.',
      `PORT=${PORT}`,
      'NODE_ENV=production',
      `CLIENT_ORIGIN=${BASE_URL}`,
      `JWT_SECRET=${jwt}`,
      'JWT_EXPIRES_IN=12h',
      '# Login inicial do painel (troque a senha após o primeiro acesso):',
      'ADMIN_EMAIL=admin@simulaescola.local',
      'ADMIN_PASSWORD=simula123',
      'TEST_MODE=true',
      'AUTHORIZED_RECIPIENT=',
      `GOOGLE_REDIRECT_URI=${BASE_URL}/api/gmail/oauth/callback`,
      'OPENAI_API_KEY=',
      '',
    ].join('\n');
    fs.writeFileSync(envPath, content, 'utf8');
  }
  return envPath;
}

// --- Backend ----------------------------------------------------------------
function startBackend() {
  const { serverDir, clientDist } = resourcePaths();
  const dataDir = userDataDir();
  const envPath = ensureEnvFile(dataDir);
  const dbFile = path.join(dataDir, 'simula.db');

  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'production',
    DOTENV_PATH: envPath,
    DATABASE_FILE: dbFile,
    CLIENT_DIST: clientDist,
    CLIENT_ORIGIN: BASE_URL,
    GOOGLE_REDIRECT_URI: `${BASE_URL}/api/gmail/oauth/callback`,
  };

  const entry = path.join(serverDir, 'src', 'index.js');
  // Usa o Node embutido no Electron para rodar o backend (ELECTRON_RUN_AS_NODE).
  backendProc = spawn(process.execPath, [entry], {
    cwd: serverDir,
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProc.stdout.on('data', (d) => console.log('[backend]', d.toString().trim()));
  backendProc.stderr.on('data', (d) => console.error('[backend]', d.toString().trim()));
  backendProc.on('exit', (code) => {
    console.log('[backend] encerrado com código', code);
    backendProc = null;
  });
}

function stopBackend() {
  if (backendProc) {
    try { backendProc.kill(); } catch { /* ignore */ }
    backendProc = null;
  }
}

// Aguarda o backend responder no /api/health.
function waitForBackend(timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(`${BASE_URL}/api/health`, (res) => {
        if (res.statusCode === 200) {
          res.resume();
          resolve();
        } else {
          res.resume();
          retry();
        }
      });
      req.on('error', retry);
      req.setTimeout(2000, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('O servidor interno não respondeu a tempo.'));
      } else {
        setTimeout(tryOnce, 500);
      }
    };
    tryOnce();
  });
}

// --- Janelas ----------------------------------------------------------------
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: '#1d306e',
    webPreferences: { contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#f4f6fb',
    title: 'Simula Escola IA',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Abre links externos (ex.: consentimento do Google) no navegador padrão.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(BASE_URL)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(BASE_URL);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) { splashWindow.close(); splashWindow = null; }
    mainWindow.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [{ role: 'quit', label: 'Sair' }],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { role: 'reload', label: 'Recarregar' },
        { role: 'resetZoom', label: 'Zoom padrão' },
        { role: 'zoomIn', label: 'Aumentar zoom' },
        { role: 'zoomOut', label: 'Diminuir zoom' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Abrir pasta de dados',
          click: () => shell.openPath(userDataDir()),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Ciclo de vida ----------------------------------------------------------
// Garante instância única (evita dois backends na mesma porta).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    buildMenu();
    createSplash();
    startBackend();
    try {
      await waitForBackend();
      createMainWindow();
    } catch (err) {
      if (splashWindow) { splashWindow.close(); splashWindow = null; }
      dialog.showErrorBox(
        'Erro ao iniciar',
        `Não foi possível iniciar o servidor interno.\n\n${err.message}`,
      );
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopBackend);
process.on('exit', stopBackend);
