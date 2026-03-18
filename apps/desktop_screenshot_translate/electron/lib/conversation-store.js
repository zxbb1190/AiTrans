const fs = require('node:fs');
const path = require('node:path');

function buildId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptySession() {
  return {
    sessionId: buildId('session'),
    messages: [],
    composerText: '',
  };
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null;
  }

  return {
    id: typeof message.id === 'string' && message.id.trim() ? message.id.trim() : buildId('message'),
    role: typeof message.role === 'string' && message.role.trim() ? message.role.trim() : 'assistant',
    kind: typeof message.kind === 'string' && message.kind.trim() ? message.kind.trim() : 'assistant_reply',
    requestId: typeof message.requestId === 'string' && message.requestId.trim() ? message.requestId.trim() : null,
    captureSessionId:
      typeof message.captureSessionId === 'string' && message.captureSessionId.trim()
        ? message.captureSessionId.trim()
        : null,
    createdAt:
      typeof message.createdAt === 'string' && message.createdAt.trim()
        ? message.createdAt.trim()
        : new Date().toISOString(),
    stageStatus:
      typeof message.stageStatus === 'string' && message.stageStatus.trim()
        ? message.stageStatus.trim()
        : 'idle',
    text: typeof message.text === 'string' ? message.text : '',
    sourceText: typeof message.sourceText === 'string' ? message.sourceText : '',
    sourceDraft: typeof message.sourceDraft === 'string' ? message.sourceDraft : (typeof message.sourceText === 'string' ? message.sourceText : ''),
    lastSubmittedSource:
      typeof message.lastSubmittedSource === 'string'
        ? message.lastSubmittedSource
        : (typeof message.sourceText === 'string' ? message.sourceText.trim() : ''),
    translatedText: typeof message.translatedText === 'string' ? message.translatedText : '',
    sourceLanguage:
      typeof message.sourceLanguage === 'string' && message.sourceLanguage.trim()
        ? message.sourceLanguage.trim()
        : 'auto',
    targetLanguage:
      typeof message.targetLanguage === 'string' && message.targetLanguage.trim()
        ? message.targetLanguage.trim()
        : 'zh-Hans',
    previewDataUrl:
      typeof message.previewDataUrl === 'string' && message.previewDataUrl.trim()
        ? message.previewDataUrl
        : null,
    previewExpanded: Boolean(message.previewExpanded),
    errorOrigin:
      typeof message.errorOrigin === 'string' && message.errorOrigin.trim()
        ? message.errorOrigin
        : null,
    copyFeedback: typeof message.copyFeedback === 'string' ? message.copyFeedback : '',
  };
}

function normalizeSession(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)) {
    return createEmptySession();
  }

  const normalizedMessages = Array.isArray(session.messages)
    ? session.messages.map(normalizeMessage).filter(Boolean)
    : [];

  return {
    sessionId:
      typeof session.sessionId === 'string' && session.sessionId.trim()
        ? session.sessionId.trim()
        : buildId('session'),
    messages: normalizedMessages,
    composerText: typeof session.composerText === 'string' ? session.composerText : '',
  };
}

function createConversationStore(app, namespace) {
  const storePath = path.join(app.getPath('userData'), `${namespace}.conversation.json`);

  function load() {
    try {
      const raw = fs.readFileSync(storePath, 'utf-8');
      return normalizeSession(JSON.parse(raw));
    } catch {
      return createEmptySession();
    }
  }

  function save(session) {
    const normalized = normalizeSession(session);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(normalized, null, 2), 'utf-8');
    return {
      path: storePath,
      session: normalized,
    };
  }

  function clear() {
    try {
      fs.rmSync(storePath, { force: true });
    } catch {
      // keep clear best-effort; caller treats missing file as already cleared
    }
    return {
      path: storePath,
    };
  }

  return {
    getPath() {
      return storePath;
    },
    load,
    save,
    clear,
  };
}

module.exports = {
  createConversationStore,
};
