const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');
const https = require('node:https');

const electronRoot = path.resolve(__dirname, '..');
const viteConfigPath = path.join(electronRoot, 'vite.panel.config.mjs');
const defaultPanelDevServerUrl = process.env.AITRANS_PANEL_DEV_SERVER_URL || 'http://127.0.0.1:5174';
const panelDevServerUrl = new URL(defaultPanelDevServerUrl);
const isWindows = process.platform === 'win32';

let viteProcess = null;
let electronProcess = null;
let shuttingDown = false;
let restartingElectron = false;
let queuedElectronRestart = false;
let queuedFullRestart = false;
let restartTimer = null;
let watchEntries = [];

function prefixPipe(stream, prefix) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim().length > 0) {
        process.stdout.write(`[${prefix}] ${line}\n`);
      }
    }
  });
  stream.on('end', () => {
    if (buffer.trim().length > 0) {
      process.stdout.write(`[${prefix}] ${buffer}\n`);
    }
  });
}

function resolveBinPath(name) {
  return path.join(
    electronRoot,
    'node_modules',
    '.bin',
    isWindows ? `${name}.cmd` : name,
  );
}

function spawnLogged(label, command, args, extra = {}) {
  const normalizedCommand = isWindows
    ? 'cmd.exe'
    : command;
  const normalizedArgs = isWindows
    ? ['/d', '/s', '/c', buildWindowsCommand(command, args)]
    : args;

  const child = spawn(normalizedCommand, normalizedArgs, {
    cwd: electronRoot,
    env: {
      ...process.env,
      ...extra.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...extra,
  });
  if (child.stdout) {
    prefixPipe(child.stdout, label);
  }
  if (child.stderr) {
    prefixPipe(child.stderr, label);
  }
  return child;
}

function quoteWindowsArg(value) {
  if (value.length === 0) {
    return '""';
  }
  if (!/[\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
}

function buildWindowsCommand(command, args) {
  return [command, ...args].map((part) => quoteWindowsArg(part)).join(' ');
}

function runCommand(label, command, args, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnLogged(label, command, args, extra);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} exited with code ${code ?? 'unknown'}`));
    });
    child.on('error', reject);
  });
}

function waitForUrl(url, timeoutMs = 30000) {
  const client = url.protocol === 'https:' ? https : http;
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const request = client.get(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: '/',
          timeout: 1500,
        },
        (response) => {
          response.resume();
          resolve();
        },
      );
      request.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`panel dev server did not become ready: ${url.toString()}`));
          return;
        }
        setTimeout(tryOnce, 250);
      });
      request.on('timeout', () => {
        request.destroy();
      });
    };

    tryOnce();
  });
}

function killChild(child) {
  if (!child || child.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    if (isWindows) {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
      });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
      return;
    }

    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
      resolve();
    }, 1200);
  });
}

async function runMaterialize() {
  const npmBin = isWindows ? 'npm.cmd' : 'npm';
  process.stdout.write('[dev] materializing project before HMR startup\n');
  await runCommand('materialize', npmBin, ['run', 'materialize:project']);
}

async function startVite() {
  const viteBin = resolveBinPath('vite');
  process.stdout.write(`[dev] starting panel dev server at ${panelDevServerUrl.toString()}\n`);
  viteProcess = spawnLogged('vite', viteBin, [
    '--config',
    'vite.panel.config.mjs',
    '--host',
    panelDevServerUrl.hostname,
    '--port',
    panelDevServerUrl.port || '5174',
    '--strictPort',
  ]);
  viteProcess.on('exit', (code) => {
    viteProcess = null;
    if (!shuttingDown) {
      process.stderr.write(`[dev] vite exited unexpectedly with code ${code ?? 'unknown'}\n`);
      shutdown(code ?? 1);
    }
  });
  await waitForUrl(panelDevServerUrl);
}

async function startElectron() {
  const electronBin = resolveBinPath('electron');
  process.stdout.write('[dev] starting Electron with panel HMR enabled\n');
  electronProcess = spawnLogged('electron', electronBin, ['.'], {
    env: {
      AITRANS_PANEL_DEV_SERVER_URL: panelDevServerUrl.toString().replace(/\/$/, ''),
    },
  });
  electronProcess.on('exit', (code) => {
    const exitedDuringRestart = restartingElectron;
    electronProcess = null;
    if (shuttingDown || exitedDuringRestart) {
      return;
    }
    process.stdout.write(`[dev] Electron exited with code ${code ?? 'unknown'}\n`);
    shutdown(code ?? 0);
  });
}

async function restartElectron(reason) {
  if (shuttingDown) {
    return;
  }
  if (restartingElectron) {
    queuedElectronRestart = true;
    return;
  }
  restartingElectron = true;
  process.stdout.write(`[dev] restarting Electron (${reason})\n`);
  await killChild(electronProcess);
  await startElectron();
  restartingElectron = false;
  if (queuedFullRestart) {
    queuedFullRestart = false;
    await restartEverything('queued full restart');
    return;
  }
  if (queuedElectronRestart) {
    queuedElectronRestart = false;
    await restartElectron('queued restart');
  }
}

async function restartEverything(reason) {
  if (shuttingDown) {
    return;
  }
  if (restartingElectron) {
    queuedFullRestart = true;
    return;
  }
  restartingElectron = true;
  process.stdout.write(`[dev] restarting Vite + Electron (${reason})\n`);
  await killChild(electronProcess);
  await killChild(viteProcess);
  await startVite();
  await startElectron();
  restartingElectron = false;
  if (queuedFullRestart) {
    queuedFullRestart = false;
    await restartEverything('queued full restart');
    return;
  }
  if (queuedElectronRestart) {
    queuedElectronRestart = false;
    await restartElectron('queued restart');
  }
}

function scheduleRestart(kind, reason) {
  if (shuttingDown) {
    return;
  }
  if (restartTimer) {
    clearTimeout(restartTimer);
  }
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (kind === 'full') {
      restartEverything(reason).catch((error) => shutdown(1, error));
      return;
    }
    restartElectron(reason).catch((error) => shutdown(1, error));
  }, 180);
}

function createWatcher(targetPath, kind) {
  if (!fs.existsSync(targetPath)) {
    return null;
  }

  const watcher = fs.watch(
    targetPath,
    {
      recursive: fs.statSync(targetPath).isDirectory() && isWindows,
    },
    (_eventType, filename) => {
      const changed = filename ? path.join(targetPath, filename.toString()) : targetPath;
      scheduleRestart(kind, path.relative(electronRoot, changed));
    },
  );
  watcher.on('error', (error) => {
    process.stderr.write(`[dev] watcher error for ${targetPath}: ${error.message}\n`);
  });
  return watcher;
}

function startWatchers() {
  const restartPaths = [
    path.join(electronRoot, 'main.js'),
    path.join(electronRoot, 'preload.js'),
    path.join(electronRoot, 'package.json'),
    path.join(electronRoot, 'lib'),
    path.join(electronRoot, 'renderer', 'overlay'),
    path.join(electronRoot, 'renderer', 'setup'),
    path.join(electronRoot, 'project-generated'),
  ];
  const fullRestartPaths = [viteConfigPath];

  watchEntries = [
    ...restartPaths.map((targetPath) => createWatcher(targetPath, 'electron')).filter(Boolean),
    ...fullRestartPaths.map((targetPath) => createWatcher(targetPath, 'full')).filter(Boolean),
  ];
}

async function shutdown(code = 0, error = null) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (error) {
    process.stderr.write(`[dev] shutting down after error: ${error.message}\n`);
  }
  for (const watcher of watchEntries) {
    try {
      watcher.close();
    } catch {
      // ignore watcher close failures during shutdown
    }
  }
  watchEntries = [];
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  await killChild(electronProcess);
  await killChild(viteProcess);
  process.exit(code);
}

process.on('SIGINT', () => {
  shutdown(0).catch(() => process.exit(0));
});
process.on('SIGTERM', () => {
  shutdown(0).catch(() => process.exit(0));
});

(async () => {
  try {
    await runMaterialize();
    await startVite();
    startWatchers();
    await startElectron();
  } catch (error) {
    await shutdown(1, error instanceof Error ? error : new Error(String(error)));
  }
})();
