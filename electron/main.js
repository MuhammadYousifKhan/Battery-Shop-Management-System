const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

let backendProcess = null;

function getBackendEntry() {
  const backendBaseDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'dist')
    : path.join(__dirname, '..', 'backend', 'dist');

  const candidates = [
    // ncc single-file bundle output
    path.join(backendBaseDir, 'index.js'),
    // tsc output layout
    path.join(backendBaseDir, 'api', 'server.js'),
  ];

  for (const entry of candidates) {
    if (fs.existsSync(entry)) {
      return entry;
    }
  }

  return null;
}

function getFrontendEntry() {
  // Kept for fallback / logging only.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend', 'build', 'index.html');
  }
  return path.join(__dirname, '..', 'frontend', 'build', 'index.html');
}

function getFrontendBuildDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend', 'build');
  }
  return path.join(__dirname, '..', 'frontend', 'build');
}

function getLogPath() {
  return path.join(app.getPath('userData'), 'desktop.log');
}

function logLine(message) {
  try {
    fs.appendFileSync(getLogPath(), `[${new Date().toISOString()}] ${message}\n`);
  } catch (err) {
    console.error('Failed to write desktop log:', err);
  }
}

function startBackend() {
  const backendEntry = getBackendEntry();
  logLine(`Backend entry: ${backendEntry || 'NOT FOUND'}`);

  if (!backendEntry) {
    const backendBaseDir = app.isPackaged
      ? path.join(process.resourcesPath, 'backend', 'dist')
      : path.join(__dirname, '..', 'backend', 'dist');
    logLine(`Backend entry file not found under: ${backendBaseDir}`);
    logLine(`Tried: ${path.join(backendBaseDir, 'index.js')}`);
    logLine(`Tried: ${path.join(backendBaseDir, 'api', 'server.js')}`);
    return;
  }

  const projectRoot = path.join(__dirname, '..');
  const envPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(projectRoot, '.env');
  logLine(
    `Env file (MONGO_URI etc.): ${envPath} — ${fs.existsSync(envPath) ? 'found' : 'MISSING (build needs repo root .env; see package.json extraResources)'}`
  );

  backendProcess = spawn(process.execPath, [backendEntry], {
    cwd: app.isPackaged ? process.resourcesPath : projectRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: process.env.PORT || '5000',
      SERVE_FRONTEND: '1',
      FRONTEND_BUILD_DIR: getFrontendBuildDir(),
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (backendProcess.stdout) {
    backendProcess.stdout.on('data', (data) => {
      logLine(`backend: ${data.toString().trim()}`);
    });
  }

  if (backendProcess.stderr) {
    backendProcess.stderr.on('data', (data) => {
      logLine(`backend-error: ${data.toString().trim()}`);
    });
  }

  backendProcess.on('exit', (code) => {
    logLine(`Backend exited with code ${code}`);
  });

  backendProcess.on('error', (err) => {
    logLine(`Failed to start backend: ${err.message}`);
  });
}

function waitForBackendReady({ port, timeoutMs }) {
  const startedAt = Date.now();
  const url = `http://127.0.0.1:${port}/`;

  return new Promise((resolve, reject) => {
    const tick = () => {
      if (Date.now() - startedAt > timeoutMs) {
        return reject(new Error(`Backend not ready after ${timeoutMs}ms: ${url}`));
      }

      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          return resolve();
        }
        setTimeout(tick, 500);
      });

      req.on('error', () => {
        setTimeout(tick, 500);
      });
    };

    tick();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true
    }
  });

  const entry = getFrontendEntry();
  logLine(`Frontend entry: ${entry}`);

  if (!fs.existsSync(entry)) {
    logLine('Frontend index.html not found.');
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logLine(`Frontend load failed: ${errorCode} ${errorDescription}`);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    logLine(`Renderer process gone: ${details.reason}`);
  });

  const port = process.env.PORT || '5000';
  const appUrl = `http://127.0.0.1:${port}`;
  logLine(`Loading URL: ${appUrl}`);
  win.loadURL(appUrl);

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
}

app.whenReady().then(() => {
  logLine('App ready.');
  startBackend();

  const port = parseInt(process.env.PORT || '5000', 10);
  waitForBackendReady({ port, timeoutMs: 60000 })
    .then(() => {
      logLine('Backend ready. Creating window.');
      createWindow();
    })
    .catch((err) => {
      logLine(`Backend readiness check failed: ${err.message}`);
      createWindow();
    });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
});
