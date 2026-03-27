const { spawn } = require('node:child_process');

let workerState = null;
let requestSequence = 0;

function buildRuntimeKey(runtime) {
  return [
    runtime?.executable || '',
    runtime?.scriptPath || '',
    runtime?.device || '',
  ].join('|');
}

function getRecentStderr(state) {
  return state.stderrChunks.join('').trim();
}

function rejectPending(state, error) {
  for (const pending of state.pending.values()) {
    clearTimeout(pending.timeout);
    pending.reject(error);
  }
  state.pending.clear();
}

function disposeWorker(state, error = null) {
  if (!state) {
    return;
  }
  if (state.stdoutBuffer || state.stderrBuffer) {
    state.stdoutBuffer = '';
    state.stderrBuffer = '';
  }
  if (error) {
    rejectPending(state, error);
  }
  if (workerState === state) {
    workerState = null;
  }
}

function ensureWorker(runtime) {
  const runtimeKey = buildRuntimeKey(runtime);
  if (workerState && workerState.runtimeKey === runtimeKey && !workerState.child.killed) {
    return workerState;
  }

  if (workerState && !workerState.child.killed) {
    workerState.child.kill();
  }

  const child = spawn(runtime.executable, [runtime.scriptPath, '--worker'], {
    env: {
      ...process.env,
      PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
      PYTHONIOENCODING: 'utf-8',
    },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const state = {
    child,
    runtimeKey,
    pending: new Map(),
    stdoutBuffer: '',
    stderrBuffer: '',
    stderrChunks: [],
  };

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', (chunk) => {
    state.stdoutBuffer += chunk;
    const lines = state.stdoutBuffer.split(/\r?\n/u);
    state.stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      let payload;
      try {
        payload = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const id = payload?.id;
      if (!id || !state.pending.has(id)) {
        continue;
      }
      const pending = state.pending.get(id);
      state.pending.delete(id);
      clearTimeout(pending.timeout);
      if (payload.ok) {
        pending.resolve(payload);
      } else {
        const stderr = getRecentStderr(state);
        pending.reject(new Error((payload.error || 'paddleocr worker request failed') + (stderr ? ` | stderr: ${stderr}` : '')));
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    state.stderrBuffer += chunk;
    state.stderrChunks.push(chunk);
    if (state.stderrChunks.join('').length > 24000) {
      while (state.stderrChunks.join('').length > 16000 && state.stderrChunks.length > 1) {
        state.stderrChunks.shift();
      }
    }
  });

  child.once('error', (error) => {
    disposeWorker(state, error instanceof Error ? error : new Error(String(error)));
  });

  child.once('exit', (code, signal) => {
    const stderr = getRecentStderr(state);
    const detail = `paddleocr worker exited (code=${code}, signal=${signal || 'null'})`;
    disposeWorker(state, new Error(detail + (stderr ? ` | stderr: ${stderr}` : '')));
  });

  workerState = state;
  return state;
}

function sendWorkerRequest(runtime, payload, timeoutMs) {
  const state = ensureWorker(runtime);
  const id = `ocr_${Date.now()}_${++requestSequence}`;
  const message = {
    id,
    device: runtime.device,
    ...payload,
  };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      state.pending.delete(id);
      const stderr = getRecentStderr(state);
      try {
        state.child.kill();
      } catch {
        // ignore
      }
      const detail = `paddleocr worker request timed out after ${timeoutMs}ms${stderr ? ` | stderr: ${stderr}` : ''}`;
      disposeWorker(state, new Error(detail));
      reject(new Error(detail));
    }, timeoutMs);

    state.pending.set(id, { resolve, reject, timeout });
    state.child.stdin.write(JSON.stringify(message) + '\n', 'utf8');
  });
}

function requestPaddleOcrRecognition(runtime, request) {
  return sendWorkerRequest(runtime, {
    action: 'recognize',
    image: request.imagePath,
    lang: request.language,
  }, 20000);
}

function requestPaddleOcrWarmup(runtime, languages) {
  const normalizedLanguages = Array.from(new Set((languages || []).filter(Boolean)));
  if (normalizedLanguages.length === 0) {
    return Promise.resolve({ ok: true, warmed: [] });
  }
  return sendWorkerRequest(runtime, {
    action: 'warmup',
    languages: normalizedLanguages,
  }, 60000);
}

function shutdownPaddleOcrWorker() {
  if (!workerState) {
    return;
  }
  const state = workerState;
  workerState = null;
  try {
    state.child.kill();
  } catch {
    // ignore
  }
  rejectPending(state, new Error('paddleocr worker was shut down'));
}

process.on('exit', shutdownPaddleOcrWorker);

module.exports = {
  requestPaddleOcrRecognition,
  requestPaddleOcrWarmup,
  shutdownPaddleOcrWorker,
};
