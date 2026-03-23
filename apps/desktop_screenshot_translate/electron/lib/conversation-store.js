const fs = require('node:fs');
const path = require('node:path');

function buildId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptySession() {
  const now = new Date().toISOString();
  return {
    sessionId: buildId('session'),
    createdAt: now,
    updatedAt: now,
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
    sourceDraft:
      typeof message.sourceDraft === 'string'
        ? message.sourceDraft
        : (typeof message.sourceText === 'string' ? message.sourceText : ''),
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
    errorSummary: typeof message.errorSummary === 'string' ? message.errorSummary : '',
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
  const createdAt =
    typeof session.createdAt === 'string' && session.createdAt.trim()
      ? session.createdAt.trim()
      : new Date().toISOString();
  const updatedAt =
    typeof session.updatedAt === 'string' && session.updatedAt.trim()
      ? session.updatedAt.trim()
      : createdAt;

  return {
    sessionId:
      typeof session.sessionId === 'string' && session.sessionId.trim()
        ? session.sessionId.trim()
        : buildId('session'),
    createdAt,
    updatedAt,
    messages: normalizedMessages,
    composerText: typeof session.composerText === 'string' ? session.composerText : '',
  };
}

function dedupeSessions(sessions) {
  const map = new Map();
  for (const session of sessions) {
    const normalized = normalizeSession(session);
    map.set(normalized.sessionId, normalized);
  }
  return Array.from(map.values()).sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt || 0) || 0;
    const rightTime = Date.parse(right.updatedAt || right.createdAt || 0) || 0;
    return rightTime - leftTime;
  });
}

function normalizeConversationState(rawState) {
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
    return {
      activeSession: createEmptySession(),
      historySessions: [],
    };
  }

  if (rawState.activeSession || Array.isArray(rawState.historySessions)) {
    const activeSession = normalizeSession(rawState.activeSession);
    const historySessions = dedupeSessions(rawState.historySessions || []).filter(
      (session) => session.sessionId !== activeSession.sessionId,
    );
    return {
      activeSession,
      historySessions,
    };
  }

  if (rawState.sessionId || Array.isArray(rawState.messages) || typeof rawState.composerText === 'string') {
    return {
      activeSession: normalizeSession(rawState),
      historySessions: [],
    };
  }

  return {
    activeSession: createEmptySession(),
    historySessions: [],
  };
}

function createConversationStore(app, namespace) {
  const storePath = path.join(app.getPath('userData'), `${namespace}.conversation.json`);

  function load() {
    try {
      const raw = fs.readFileSync(storePath, 'utf-8');
      return normalizeConversationState(JSON.parse(raw));
    } catch {
      return normalizeConversationState(null);
    }
  }

  function save(state) {
    const normalized = normalizeConversationState(state);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(normalized, null, 2), 'utf-8');
    return {
      path: storePath,
      state: normalized,
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
