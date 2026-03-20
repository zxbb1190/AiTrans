<script setup>
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

const editTimers = new Map();
const copyResetTimers = new Map();
const threadRef = ref(null);
const composerComposing = ref(false);
let persistTimer = null;
let threadMutationObserver = null;
const scrollBurstTimers = new Set();

function createEmptyPayload() {
  return {
    product: {
      displayName: 'AiTrans 截图翻译',
      copy: {
        copy_success: '译文已复制',
        empty_translation: '未识别到可翻译文本',
        retry_label: '重试翻译',
        recapture_label: '重新截图',
        close_label: '关闭',
        new_chat_label: '新聊天',
        clear_history_label: '清空记录',
        send_label: '发送',
        clear_confirm_title: '清空对话并删除本地记录',
        clear_confirm_copy: '此操作会删除当前对话与本地缓存记录，是否继续？',
        new_chat_confirm_title: '开始新聊天',
        new_chat_confirm_copy: '当前对话将被清空并删除本地记录，然后开启新会话。',
      },
      conversation: {
        sendShortcut: 'enter',
        sendShortcutOptions: ['enter', 'ctrl_enter', 'shift_enter'],
      },
    },
    result: null,
  };
}

function createSession(sessionId = buildId('session')) {
  return {
    sessionId,
    messages: [],
    composerText: '',
  };
}

function buildId(prefix) {
  const generator = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  return `${prefix}_${generator ? generator() : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`}`;
}

function normalizeMessage(message) {
  return {
    id: message.id || buildId('message'),
    role: message.role || 'assistant',
    kind: message.kind || 'assistant_reply',
    requestId: message.requestId || null,
    captureSessionId: message.captureSessionId || null,
    createdAt: message.createdAt || new Date().toISOString(),
    stageStatus: message.stageStatus || 'idle',
    text: message.text || '',
    sourceText: message.sourceText || '',
    sourceDraft: message.sourceDraft || message.sourceText || '',
    lastSubmittedSource: message.lastSubmittedSource || (message.sourceText || '').trim(),
    translatedText: message.translatedText || '',
    sourceLanguage: message.sourceLanguage || 'auto',
    targetLanguage: message.targetLanguage || 'zh-Hans',
    previewDataUrl: message.previewDataUrl || null,
    previewExpanded: Boolean(message.previewExpanded),
    errorOrigin: message.errorOrigin || null,
    copyFeedback: message.copyFeedback || '',
  };
}

function loadConversationCache() {
  try {
    const response = window.aitransDesktop.loadConversationState();
    if (!response?.ok || !response.session) {
      return createSession();
    }
    return {
      sessionId: response.session.sessionId || buildId('session'),
      composerText: typeof response.session.composerText === 'string' ? response.session.composerText : '',
      messages: Array.isArray(response.session.messages)
        ? response.session.messages.map(normalizeMessage)
        : [],
    };
  } catch {
    return createSession();
  }
}

function createConversationSnapshot() {
  return {
    sessionId: appState.session.sessionId,
    composerText: appState.session.composerText,
    messages: appState.session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      kind: message.kind,
      requestId: message.requestId,
      captureSessionId: message.captureSessionId,
      createdAt: message.createdAt,
      stageStatus: message.stageStatus,
      text: message.text,
      sourceText: message.sourceText,
      sourceDraft: message.sourceDraft,
      lastSubmittedSource: message.lastSubmittedSource,
      translatedText: message.translatedText,
      sourceLanguage: message.sourceLanguage,
      targetLanguage: message.targetLanguage,
      previewDataUrl: message.previewDataUrl,
      previewExpanded: message.previewExpanded,
      errorOrigin: message.errorOrigin,
      copyFeedback: message.copyFeedback,
    })),
  };
}

function flushConversationPersist() {
  persistTimer = null;
  void window.aitransDesktop.saveConversationState(createConversationSnapshot());
}

function persistConversation({ immediate = false } = {}) {
  if (persistTimer) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }

  if (immediate) {
    flushConversationPersist();
    return;
  }

  persistTimer = window.setTimeout(() => {
    flushConversationPersist();
  }, 180);
}

async function clearConversationCache() {
  if (persistTimer) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  await window.aitransDesktop.clearConversationState();
}

function scrollThreadToBottom() {
  nextTick(() => {
    if (!threadRef.value) {
      return;
    }
    const performScroll = () => {
      if (!threadRef.value) {
        return;
      }
      const lastMessage = threadRef.value.querySelector('.message:last-of-type');
      if (lastMessage && typeof lastMessage.scrollIntoView === 'function') {
        lastMessage.scrollIntoView({ block: 'end' });
      }
      threadRef.value.scrollTop = threadRef.value.scrollHeight;
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        performScroll();
      });
    });
  });
}

function scheduleScrollBurst() {
  scrollThreadToBottom();
  for (const delay of [40, 140, 280]) {
    const timer = window.setTimeout(() => {
      scrollBurstTimers.delete(timer);
      scrollThreadToBottom();
    }, delay);
    scrollBurstTimers.add(timer);
  }
}

function conversationScrollSignature() {
  return appState.session.messages
    .map((message) => [
      message.id,
      message.stageStatus,
      message.text,
      message.translatedText,
      message.sourceDraft,
      message.previewExpanded ? 'preview-open' : 'preview-closed',
    ].join(':'))
    .join('|');
}

const appState = reactive({
  payload: createEmptyPayload(),
  session: loadConversationCache(),
});

function mergeIncomingPayload(payload) {
  const fallback = createEmptyPayload();
  return {
    ...fallback,
    ...payload,
    product: {
      ...fallback.product,
      ...(payload?.product || {}),
      copy: {
        ...fallback.product.copy,
        ...(payload?.product?.copy || {}),
      },
      conversation: {
        ...fallback.product.conversation,
        ...(payload?.product?.conversation || {}),
      },
    },
  };
}

function resolvedSendShortcut() {
  const candidate = appState.payload.product.conversation?.sendShortcut || 'enter';
  return ['enter', 'ctrl_enter', 'shift_enter'].includes(candidate) ? candidate : 'enter';
}

function handleComposerKeydown(event) {
  if (event.key !== 'Enter') {
    return;
  }
  if (event.isComposing || composerComposing.value) {
    return;
  }

  const shortcut = resolvedSendShortcut();
  const ctrlLike = event.ctrlKey || event.metaKey;
  const shift = event.shiftKey;
  let matched = false;

  if (shortcut === 'enter') {
    matched = !ctrlLike && !shift && !event.altKey;
  } else if (shortcut === 'ctrl_enter') {
    matched = ctrlLike && !shift && !event.altKey;
  } else if (shortcut === 'shift_enter') {
    matched = shift && !ctrlLike && !event.altKey;
  }

  if (!matched) {
    return;
  }

  event.preventDefault();
  void handleSendMessage();
}

function upsertMessage(nextMessage) {
  const index = appState.session.messages.findIndex((item) => item.id === nextMessage.id);
  const normalized = normalizeMessage(nextMessage);
  if (index >= 0) {
    appState.session.messages[index] = {
      ...appState.session.messages[index],
      ...normalized,
    };
  } else {
    appState.session.messages.push(normalized);
  }
  persistConversation();
  scheduleScrollBurst();
  return appState.session.messages.find((item) => item.id === normalized.id);
}

function findMessageById(messageId) {
  return appState.session.messages.find((item) => item.id === messageId) || null;
}

function stageLabel(stageStatus) {
  return {
    idle: '待命',
    capturing: '截图中',
    ocr_processing: '识别中',
    translation_processing: '翻译中',
    translation_ready: '已完成',
    failed: '失败',
  }[stageStatus] || '处理中';
}

function resultStageSummary(result) {
  if (result.stageStatus === 'failed') {
    return result.errorOrigin || appState.payload.product.copy.failure_title;
  }
  if (result.stageStatus === 'capturing') {
    return '已发送截图';
  }
  if (result.stageStatus === 'ocr_processing') {
    return '正在识别原文';
  }
  if (result.stageStatus === 'translation_processing') {
    return 'AI 正在回复';
  }
  return 'AI 回复';
}

function buildUserCaptureMessage(result, captureSessionId) {
  return {
    id: `user_capture_${captureSessionId}`,
    role: 'user',
    kind: 'user_screenshot',
    captureSessionId,
    createdAt: new Date().toISOString(),
    stageStatus: result.stageStatus,
    text: resultStageSummary(result),
    previewDataUrl: result.capturePreviewDataUrl || null,
    previewExpanded: false,
  };
}

function buildAssistantTranslationMessage(result, requestId) {
  const sourceText = result.sourceText || '';
  return {
    id: `assistant_translation_${requestId}`,
    role: 'assistant',
    kind: 'assistant_translation',
    requestId,
    captureSessionId: result.captureMeta?.captureSessionId || null,
    createdAt: new Date().toISOString(),
    stageStatus: result.stageStatus,
    sourceText,
    sourceDraft: sourceText,
    lastSubmittedSource: sourceText.trim(),
    translatedText: result.translatedText || '',
    sourceLanguage: result.sourceLanguage || 'auto',
    targetLanguage: result.captureMeta?.targetLanguage || 'zh-Hans',
    errorOrigin: result.errorOrigin || null,
  };
}

function ingestResult(result) {
  const captureMeta = result.captureMeta || {};
  const conversationRequestId =
    typeof captureMeta.conversationRequestId === 'string' && captureMeta.conversationRequestId.trim()
      ? captureMeta.conversationRequestId.trim()
      : null;

  if (conversationRequestId) {
    upsertMessage({
      id: `assistant_translation_${conversationRequestId}`,
      ...buildAssistantTranslationMessage(result, conversationRequestId),
    });
    return;
  }

  const captureSessionId =
    typeof captureMeta.captureSessionId === 'string' && captureMeta.captureSessionId.trim()
      ? captureMeta.captureSessionId.trim()
      : buildId('capture');

  const existingUserMessage = findMessageById(`user_capture_${captureSessionId}`);
  upsertMessage({
    ...(existingUserMessage || {}),
    ...buildUserCaptureMessage(result, captureSessionId),
    createdAt: existingUserMessage?.createdAt || new Date().toISOString(),
    previewExpanded: existingUserMessage?.previewExpanded || false,
  });

  const existingAssistantMessage = findMessageById(`assistant_translation_${captureSessionId}`);
  const nextAssistantMessage = buildAssistantTranslationMessage(result, captureSessionId);
  upsertMessage({
    ...(existingAssistantMessage || {}),
    ...nextAssistantMessage,
    id: `assistant_translation_${captureSessionId}`,
    createdAt: existingAssistantMessage?.createdAt || new Date().toISOString(),
    sourceDraft: nextAssistantMessage.sourceText,
    lastSubmittedSource: nextAssistantMessage.sourceText.trim(),
  });
}

async function resetConversation() {
  appState.session = createSession();
  await clearConversationCache();
  persistConversation({ immediate: true });
}

async function handleNewChat() {
  const copy = appState.payload.product.copy;
  const confirmed = window.confirm(`${copy.new_chat_confirm_title}\n\n${copy.new_chat_confirm_copy}`);
  if (!confirmed) {
    return;
  }
  await resetConversation();
}

async function handleClearHistory() {
  const copy = appState.payload.product.copy;
  const confirmed = window.confirm(`${copy.clear_confirm_title}\n\n${copy.clear_confirm_copy}`);
  if (!confirmed) {
    return;
  }
  await resetConversation();
}

async function handleCopy(message) {
  if (!message.translatedText) {
    return;
  }
  await window.aitransDesktop.copyTranslation(message.translatedText);
  message.copyFeedback = appState.payload.product.copy.copy_success;
  persistConversation();
  const existingTimer = copyResetTimers.get(message.id);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }
  const timer = window.setTimeout(() => {
    message.copyFeedback = '';
    persistConversation();
    copyResetTimers.delete(message.id);
  }, 1600);
  copyResetTimers.set(message.id, timer);
}

async function requestAssistantTranslation(message, sourceMode = 'manual_source_edit') {
  const sourceText = (message.sourceDraft || '').trim();
  if (!sourceText) {
    return;
  }
  message.stageStatus = 'translation_processing';
  persistConversation({ immediate: true });
  if (sourceMode === 'text_chat') {
    await window.aitransDesktop.sendTextMessage({
      text: sourceText,
      sourceLanguage: message.sourceLanguage || 'auto',
      conversationRequestId: message.requestId,
    });
    return;
  }
  await window.aitransDesktop.translateEditedSource({
    sourceText,
    sourceLanguage: message.sourceLanguage || 'auto',
    conversationRequestId: message.requestId,
  });
}

function scheduleAssistantTranslation(message) {
  if (!message.requestId) {
    return;
  }
  if ((message.sourceDraft || '').trim() === (message.lastSubmittedSource || '').trim()) {
    return;
  }
  const existingTimer = editTimers.get(message.id);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }
  const timer = window.setTimeout(async () => {
    message.lastSubmittedSource = (message.sourceDraft || '').trim();
    persistConversation({ immediate: true });
    await requestAssistantTranslation(message, 'manual_source_edit');
    editTimers.delete(message.id);
  }, 700);
  editTimers.set(message.id, timer);
}

function handleAssistantSourceInput(message) {
  persistConversation();
  scheduleAssistantTranslation(message);
}

async function handleRetryTranslation(message) {
  message.lastSubmittedSource = (message.sourceDraft || '').trim();
  persistConversation({ immediate: true });
  await requestAssistantTranslation(message, 'retry_translation');
}

async function handleSendMessage() {
  const text = appState.session.composerText.trim();
  if (!text) {
    return;
  }

  const requestId = buildId('text');
  upsertMessage({
    id: `user_text_${requestId}`,
    role: 'user',
    kind: 'user_text',
    requestId,
    createdAt: new Date().toISOString(),
    stageStatus: 'translation_ready',
    text,
  });

  upsertMessage({
    id: `assistant_translation_${requestId}`,
    role: 'assistant',
    kind: 'assistant_translation',
    requestId,
    createdAt: new Date().toISOString(),
    stageStatus: 'translation_processing',
    sourceText: text,
    sourceDraft: text,
    lastSubmittedSource: text.trim(),
    translatedText: 'AI 正在回复…',
    sourceLanguage: 'auto',
    targetLanguage: 'zh-Hans',
  });

  appState.session.composerText = '';
  persistConversation({ immediate: true });
  await window.aitransDesktop.sendTextMessage({
    text,
    sourceLanguage: 'auto',
    conversationRequestId: requestId,
  });
}

async function handleRecapture() {
  await window.aitransDesktop.recapture();
}

async function handleClose() {
  await window.aitransDesktop.closePanel();
}

async function handleOpenSetup() {
  await window.aitransDesktop.openSetupGuide();
}

function togglePreview(message) {
  message.previewExpanded = !message.previewExpanded;
  persistConversation();
}

window.aitransDesktop.onPanelData((payload) => {
  appState.payload = mergeIncomingPayload(payload);
  if (payload?.result) {
    ingestResult(payload.result);
  }
});

window.aitransDesktop.onPanelCommand(async ({ command }) => {
  if (command === 'new_chat') {
    await handleNewChat();
    return;
  }
  if (command === 'clear_history') {
    await handleClearHistory();
    return;
  }
  if (command === 'open_setup') {
    await handleOpenSetup();
  }
});

onBeforeUnmount(() => {
  if (threadMutationObserver) {
    threadMutationObserver.disconnect();
    threadMutationObserver = null;
  }
  for (const timer of scrollBurstTimers.values()) {
    window.clearTimeout(timer);
  }
  scrollBurstTimers.clear();
  if (persistTimer) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  flushConversationPersist();
  for (const timer of editTimers.values()) {
    window.clearTimeout(timer);
  }
  for (const timer of copyResetTimers.values()) {
    window.clearTimeout(timer);
  }
});

onMounted(() => {
  scheduleScrollBurst();
  if (threadRef.value) {
    threadMutationObserver = new MutationObserver(() => {
      scheduleScrollBurst();
    });
    threadMutationObserver.observe(threadRef.value, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
});

watch(
  () => conversationScrollSignature(),
  () => {
    scheduleScrollBurst();
  },
);
</script>

<template>
  <main class="chat-shell">
    <div class="chat-utility-bar">
      <button class="utility-btn" type="button" title="设置与连接" aria-label="设置与连接" @click="handleOpenSetup">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11.38 1.52a1 1 0 0 0-1.76 0l-.56 1.12a7.21 7.21 0 0 0-1.2.5l-1.2-.4a1 1 0 0 0-1.23.57l-.58 1.4a1 1 0 0 0 .34 1.2l.94.73a7.3 7.3 0 0 0 0 1l-.94.73a1 1 0 0 0-.34 1.2l.58 1.4a1 1 0 0 0 1.22.56l1.21-.4c.38.22.78.39 1.2.5l.56 1.13a1 1 0 0 0 1.76 0l.56-1.12c.42-.12.82-.29 1.2-.5l1.2.4a1 1 0 0 0 1.23-.57l.58-1.4a1 1 0 0 0-.34-1.2l-.94-.73a7.3 7.3 0 0 0 0-1l.94-.73a1 1 0 0 0 .34-1.2l-.58-1.4a1 1 0 0 0-1.22-.56l-1.21.4a7.2 7.2 0 0 0-1.2-.5l-.56-1.13ZM10 12.25A2.25 2.25 0 1 1 10 7.75a2.25 2.25 0 0 1 0 4.5Z"/></svg>
      </button>
      <button class="utility-btn" type="button" title="关闭" aria-label="关闭" @click="handleClose">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z"/></svg>
      </button>
    </div>

    <section ref="threadRef" class="chat-thread">
      <div v-if="appState.session.messages.length === 0" class="empty-state">
        <div class="empty-brand">AiTrans</div>
        <div class="empty-title">{{ appState.payload.product.displayName }}</div>
        <p>从快捷键、托盘或悬浮入口开始截图，也可以直接输入要翻译的内容。</p>
      </div>

      <article
        v-for="message in appState.session.messages"
        :key="message.id"
        class="message"
        :data-role="message.role"
        :data-kind="message.kind"
      >
        <div class="message-meta">
          <span class="message-role">{{ message.role === 'user' ? '你' : 'AI' }}</span>
          <span class="message-stage">{{ stageLabel(message.stageStatus) }}</span>
        </div>

        <div v-if="message.kind === 'user_text'" class="bubble bubble--user">
          {{ message.text }}
        </div>

        <div v-else-if="message.kind === 'user_screenshot'" class="bubble bubble--user bubble--capture">
          <div class="capture-label">{{ message.text || '已发送截图' }}</div>
          <button
            v-if="message.previewDataUrl"
            class="preview-toggle"
            type="button"
            :aria-expanded="message.previewExpanded ? 'true' : 'false'"
            @click="togglePreview(message)"
          >
            <span>截图结果预览</span>
            <span>{{ message.previewExpanded ? '收起' : '展开' }}</span>
          </button>
          <img
            v-if="message.previewExpanded && message.previewDataUrl"
            class="capture-preview"
            :src="message.previewDataUrl"
            alt="capture preview"
            @load="scrollThreadToBottom"
          />
        </div>

        <div v-else-if="message.kind === 'assistant_translation'" class="bubble bubble--assistant">
          <div class="translation-card">
            <div class="translation-head">
              <div class="translation-label">原文</div>
              <div class="translation-actions">
                <button
                  class="icon-btn icon-btn--small"
                  type="button"
                  title="重新截图"
                  aria-label="重新截图"
                  @click="handleRecapture"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10a5.5 5.5 0 0 1 9.39-3.89L15.5 7.7V4.5h-3.2l1.35 1.35A4.5 4.5 0 1 0 14.5 10h1.5A6 6 0 1 1 4.5 10Z"/></svg>
                </button>
              </div>
            </div>
            <textarea
              v-model="message.sourceDraft"
              class="source-editor"
              spellcheck="false"
              :disabled="message.stageStatus === 'capturing' || message.stageStatus === 'ocr_processing'"
              @input="handleAssistantSourceInput(message)"
            />

            <div class="translation-head translation-head--secondary">
              <div class="translation-label">译文</div>
              <div class="translation-actions">
                <button
                  class="icon-btn icon-btn--small"
                  type="button"
                  title="复制译文"
                  aria-label="复制译文"
                  @click="handleCopy(message)"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.75 2A2.75 2.75 0 0 0 4 4.75v7.5A2.75 2.75 0 0 0 6.75 15h4.5A2.75 2.75 0 0 0 14 12.25v-7.5A2.75 2.75 0 0 0 11.25 2h-4.5Zm-1.25 2.75c0-.69.56-1.25 1.25-1.25h4.5c.69 0 1.25.56 1.25 1.25v7.5c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-7.5ZM9 16.5H7.5a3.5 3.5 0 0 1-3.5-3.5V6.5a.75.75 0 0 0-1.5 0V13A5 5 0 0 0 7.5 18H9a.75.75 0 0 0 0-1.5Z"/></svg>
                </button>
                <button
                  class="icon-btn icon-btn--small"
                  type="button"
                  title="重试翻译"
                  aria-label="重试翻译"
                  @click="handleRetryTranslation(message)"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5a6.5 6.5 0 1 1-5.89 9.24.75.75 0 1 1 1.36-.64A5 5 0 1 0 6.8 6.01L8.5 7.7H5V4.2l.74.74A6.47 6.47 0 0 1 10 3.5Z"/></svg>
                </button>
              </div>
            </div>
            <div class="translation-output">{{ message.translatedText || appState.payload.product.copy.empty_translation }}</div>
            <div v-if="message.copyFeedback" class="message-feedback">{{ message.copyFeedback }}</div>
            <div v-if="message.stageStatus === 'failed' && message.errorOrigin" class="message-error">
              {{ message.errorOrigin }}
            </div>
          </div>
        </div>
      </article>
    </section>

    <footer class="composer">
      <textarea
        v-model="appState.session.composerText"
        class="composer-input"
        spellcheck="false"
        placeholder="输入你想翻译或继续追问的内容…"
        @keydown="handleComposerKeydown"
        @compositionstart="composerComposing = true"
        @compositionend="composerComposing = false"
      />
      <div class="composer-toolbar">
        <button
          class="composer-icon-btn"
          type="button"
          title="重新截图"
          aria-label="重新截图"
          @click="handleRecapture"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.75 6.5a2.25 2.25 0 0 1 2.25-2.25h1.54l.63-.94A1.5 1.5 0 0 1 9.42 2.5h1.16c.5 0 .97.25 1.25.67l.63.94H14a2.25 2.25 0 0 1 2.25 2.25v7A2.25 2.25 0 0 1 14 15.75H6a2.25 2.25 0 0 1-2.25-2.25v-7ZM10 13.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Zm0-1.5a1.75 1.75 0 1 1 0-3.5 1.75 1.75 0 0 1 0 3.5Z"/></svg>
        </button>
        <div class="composer-spacer"></div>
        <button
          class="composer-send-btn"
          type="button"
          title="发送"
          aria-label="发送"
          @click="handleSendMessage"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.28 9.2 15.4 3.8c.9-.4 1.8.48 1.4 1.38l-5.4 12.14c-.42.93-1.78.86-2.1-.1l-1.16-3.47-3.47-1.16c-.96-.32-1.03-1.68-.1-2.1Zm5.82 3.02.9 2.69 4.2-9.44-9.44 4.2 2.69.9 3.36-3.36a.75.75 0 0 1 1.06 1.06l-3.36 3.36Z"/></svg>
        </button>
      </div>
    </footer>
  </main>
</template>
