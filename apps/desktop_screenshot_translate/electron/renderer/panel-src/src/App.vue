<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

function createEmptyPayload() {
  return {
    product: {
      displayName: 'AiTrans 截图翻译',
      copy: {
        copy_success: '译文已复制',
        empty_translation: '完成截图后将在此显示译文。',
      },
    },
    result: {
      stageStatus: 'idle',
      errorOrigin: null,
      capturePreviewDataUrl: null,
      sourceText: '',
      translatedText: '完成截图后将在此显示译文结果。',
      sourceLanguage: 'auto',
      selection: {
        width: 0,
        height: 0,
      },
      shortcut: 'CommandOrControl+Shift+1',
      captureMeta: null,
    },
  };
}

const appState = reactive({
  payload: createEmptyPayload(),
  copyButtonLabel: '复制译文',
  retrying: false,
  detailsExpanded: false,
  liveTranslationPending: false,
});

const sourceDraft = ref('');
const lastSubmittedSource = ref('');
let sourceDraftSyncing = false;
let liveTranslateTimer = null;
let queuedSourceText = '';

const STAGE_LABELS = {
  idle: '待命',
  capturing: '抓取中',
  ocr_processing: '识别中',
  translation_processing: '翻译中',
  translation_ready: '已完成',
  failed: '失败',
};

const STAGE_SUMMARIES = {
  idle: '从托盘或快捷键发起一次截图，结果会以悬浮面板交付。',
  capturing: '正在抓取当前截图结果，请稍候。',
  ocr_processing: '正在识别原文，结果区会保持稳定。',
  translation_processing: '原文已获得，正在生成译文。',
  translation_ready: '结果已准备好，可以直接复制、重试或重新截图。',
  failed: '本次执行未完成，可以查看摘要并继续操作。',
};

const statusText = computed(() => STAGE_LABELS[appState.payload.result.stageStatus] || '待命');
const statusSummary = computed(() => STAGE_SUMMARIES[appState.payload.result.stageStatus] || STAGE_SUMMARIES.idle);
const selectionText = computed(() => {
  const selection = appState.payload.result.selection;
  return `区域：${selection.width} x ${selection.height}`;
});
const shortcutText = computed(() => appState.payload.result.shortcut || 'CommandOrControl+Shift+1');
const sourceLanguageText = computed(() => appState.payload.result.sourceLanguage || 'auto');
const targetLanguageText = computed(() => appState.payload.result.captureMeta?.targetLanguage || 'zh-Hans');
const providerRows = computed(() => {
  const meta = appState.payload.result.captureMeta;
  const rows = [];
  if (meta?.ocrProvider) {
    rows.push({ label: 'OCR Provider', value: meta.ocrProvider });
  }
  if (meta?.translationProvider) {
    rows.push({ label: 'TRANS Provider', value: meta.translationProvider });
  }
  if (meta?.autoRetryCount) {
    rows.push({ label: 'OCR 自动重试', value: `${meta.autoRetryCount} 次` });
  }
  if (meta?.sourceMode === 'manual_source_edit') {
    rows.push({ label: '输入来源', value: '面板原文修订 / 粘贴文本' });
  }
  return rows;
});
const isBusy = computed(() =>
  ['capturing', 'ocr_processing', 'translation_processing'].includes(appState.payload.result.stageStatus) || appState.liveTranslationPending,
);
const canCopy = computed(() => !isBusy.value && Boolean(appState.payload.result.translatedText));
const canRetry = computed(() => Boolean(sourceDraft.value.trim()) && !appState.retrying);
const showFailure = computed(() => appState.payload.result.stageStatus === 'failed');
const translatedText = computed(() =>
  appState.payload.result.translatedText || appState.payload.product.copy.empty_translation,
);
const failureSummary = computed(() => appState.payload.result.errorOrigin || '主链执行失败，请检查 OCR、翻译端点或当前 Windows 权限状态。');
const auditRows = computed(() => {
  const meta = appState.payload.result.captureMeta;
  const rows = [
    { label: '快捷键', value: shortcutText.value },
    { label: '源语言', value: sourceLanguageText.value },
    { label: '目标语言', value: targetLanguageText.value },
  ];
  if (meta?.captureSessionId) {
    rows.push({ label: 'capture_session_id', value: meta.captureSessionId });
  }
  if (meta?.taskId) {
    rows.push({ label: 'task_id', value: meta.taskId });
  }
  return rows;
});
const diagnosticsText = computed(() => {
  const meta = appState.payload.result.captureMeta;
  const diagnostics = {};
  if (meta?.ocrDiagnostics) {
    diagnostics.ocr = meta.ocrDiagnostics;
  }
  if (meta?.translationDiagnostics) {
    diagnostics.translation = meta.translationDiagnostics;
  }
  return Object.keys(diagnostics).length > 0 ? JSON.stringify(diagnostics, null, 2) : '';
});
const hasDetails = computed(() => {
  const meta = appState.payload.result.captureMeta;
  return Boolean(
    appState.payload.result.capturePreviewDataUrl
    || providerRows.value.length
    || diagnosticsText.value
    || meta?.captureSessionId
    || meta?.taskId,
  );
});
const translationHeadline = computed(() =>
  isBusy.value ? '正在生成译文' : `目标：${targetLanguageText.value}`,
);
const normalizedDraft = computed(() => sourceDraft.value.trim());
const normalizedPayloadSource = computed(() => (appState.payload.result.sourceText || '').trim());
const isSourceDirty = computed(() => normalizedDraft.value !== normalizedPayloadSource.value);
const sourceEditorHint = computed(() => {
  if (appState.liveTranslationPending) {
    return '正在根据当前原文重新翻译…';
  }
  if (!normalizedDraft.value) {
    return '可直接粘贴一段文本，或在这里修正 OCR 原文后自动翻译。';
  }
  if (isSourceDirty.value) {
    return '停止输入后会自动重译，也可以手动点击“重试翻译”。';
  }
  return '这里的原文可以直接编辑；修改后会触发新的翻译结果。';
});

function syncSourceDraft(nextValue) {
  sourceDraftSyncing = true;
  sourceDraft.value = nextValue || '';
  lastSubmittedSource.value = (nextValue || '').trim();
  queueMicrotask(() => {
    sourceDraftSyncing = false;
  });
}

function clearLiveTranslateTimer() {
  if (liveTranslateTimer) {
    window.clearTimeout(liveTranslateTimer);
    liveTranslateTimer = null;
  }
}

async function requestEditedTranslation(sourceText) {
  const normalized = typeof sourceText === 'string' ? sourceText.trim() : '';
  if (!normalized) {
    return;
  }
  if (appState.liveTranslationPending) {
    queuedSourceText = normalized;
    return;
  }
  clearLiveTranslateTimer();
  appState.liveTranslationPending = true;
  lastSubmittedSource.value = normalized;
  try {
    await window.aitransDesktop.translateEditedSource({
      sourceText: normalized,
      sourceLanguage: sourceLanguageText.value,
    });
  } finally {
    appState.liveTranslationPending = false;
    if (queuedSourceText && queuedSourceText !== normalized) {
      const nextSource = queuedSourceText;
      queuedSourceText = '';
      void requestEditedTranslation(nextSource);
    }
  }
}

function scheduleEditedTranslation() {
  clearLiveTranslateTimer();
  if (!normalizedDraft.value) {
    queuedSourceText = '';
    return;
  }
  if (
    ['capturing', 'ocr_processing'].includes(appState.payload.result.stageStatus)
    || normalizedDraft.value === lastSubmittedSource.value
  ) {
    return;
  }
  liveTranslateTimer = window.setTimeout(() => {
    void requestEditedTranslation(normalizedDraft.value);
  }, 650);
}

watch(() => appState.payload.result.sourceText, (nextValue) => {
  syncSourceDraft(nextValue);
});

watch(sourceDraft, () => {
  if (sourceDraftSyncing) {
    return;
  }
  scheduleEditedTranslation();
});

async function handleCopy() {
  if (!canCopy.value) {
    return;
  }
  await window.aitransDesktop.copyTranslation(appState.payload.result.translatedText);
  appState.copyButtonLabel = appState.payload.product.copy.copy_success;
  window.setTimeout(() => {
    appState.copyButtonLabel = '复制译文';
  }, 1600);
}

async function handlePasteSource() {
  const result = await window.aitransDesktop.readClipboardText();
  if (!result?.ok || typeof result.text !== 'string') {
    return;
  }
  const nextText = result.text.trim();
  if (!nextText) {
    return;
  }
  sourceDraft.value = nextText;
  queuedSourceText = '';
  await requestEditedTranslation(nextText);
}

async function handleClose() {
  await window.aitransDesktop.closePanel();
}

async function handleRecapture() {
  await window.aitransDesktop.recapture();
}

async function handleRetryTranslation() {
  if (!canRetry.value) {
    return;
  }
  appState.retrying = true;
  try {
    await requestEditedTranslation(normalizedDraft.value);
  } finally {
    appState.retrying = false;
  }
}

function toggleDetails() {
  if (!hasDetails.value) {
    return;
  }
  appState.detailsExpanded = !appState.detailsExpanded;
}

window.aitransDesktop.onPanelData((payload) => {
  appState.payload = payload;
  appState.copyButtonLabel = '复制译文';
  appState.retrying = false;
  appState.detailsExpanded = false;
  syncSourceDraft(payload?.result?.sourceText || '');
});

window.aitransDesktop.getProjectSummary().then((summary) => {
  if (appState.payload.result.stageStatus === 'idle') {
    appState.payload.result.shortcut = summary.shortcut;
  }
});

onBeforeUnmount(() => {
  clearLiveTranslateTimer();
});
</script>

<template>
  <main class="panel-shell">
    <header class="panel-header">
      <div class="title-block">
        <div class="eyebrow">AiTrans</div>
        <div class="title-row">
          <h1>{{ appState.payload.product.displayName }}</h1>
          <span class="status-badge" :data-state="appState.payload.result.stageStatus">{{ statusText }}</span>
        </div>
        <!-- <p class="status-summary" aria-live="polite">{{ statusSummary }}</p> -->
      </div>
      <div class="header-actions">
        <span class="meta-chip">源 {{ sourceLanguageText }}</span>
        <span class="meta-chip">目标 {{ targetLanguageText }}</span>
        <button class="close-btn" @click="handleClose">
          {{ appState.payload.product.copy.close_label || '关闭' }}
        </button>
      </div>
    </header>

    <section class="action-row" aria-label="结果动作">
      <button class="primary-btn" :disabled="!canCopy" @click="handleCopy">
        {{ isBusy ? '处理中…' : appState.copyButtonLabel }}
      </button>
      <!-- <button class="secondary-btn" :disabled="appState.liveTranslationPending" @click="handlePasteSource">
        粘贴原文
      </button> -->
      <button class="secondary-btn" :disabled="!canRetry || appState.retrying" @click="handleRetryTranslation">
        {{ appState.retrying ? '重译中…' : (appState.payload.product.copy.retry_label || '重试翻译') }}
      </button>
      <button class="secondary-btn secondary-btn--ghost" :disabled="isBusy" @click="handleRecapture">
        {{ appState.payload.product.copy.recapture_label || '重新截图' }}
      </button>
    </section>

    <section v-if="showFailure" class="failure-card" aria-live="assertive">
      <div class="failure-title">{{ appState.payload.product.copy.failure_title || '翻译失败' }}</div>
      <div class="failure-copy">{{ failureSummary }}</div>
    </section>

    <section class="result-grid">
      <article class="result-card">
        <div class="card-head">
          <div class="card-label">原文</div>
          <div class="card-subtle">{{ selectionText }}</div>
        </div>
        <textarea
          v-model="sourceDraft"
          class="content-editor"
          spellcheck="false"
          :disabled="appState.payload.result.stageStatus === 'capturing' || appState.payload.result.stageStatus === 'ocr_processing'"
          placeholder="可在此修正 OCR 原文，也可直接粘贴文本进行翻译。"
        />
        <!-- <div class="editor-hint">{{ sourceEditorHint }}</div> -->
      </article>

      <article class="result-card result-card--translated">
        <div class="card-head">
          <div class="card-label">译文</div>
          <div class="card-subtle">{{ translationHeadline }}</div>
        </div>
        <pre class="content-body content-body--translated">{{ translatedText }}</pre>
      </article>
    </section>

    <section v-if="hasDetails" class="details-card" :data-open="appState.detailsExpanded">
      <button
        class="details-toggle"
        type="button"
        :aria-expanded="appState.detailsExpanded ? 'true' : 'false'"
        @click="toggleDetails"
      >
        <span>详细信息</span>
        <span>{{ appState.detailsExpanded ? '收起' : '展开' }}</span>
      </button>

      <div v-if="appState.detailsExpanded" class="details-body">
        <div class="details-grid">
          <section v-if="appState.payload.result.capturePreviewDataUrl" class="details-block">
            <div class="card-label">截图预览</div>
            <img
              class="preview-image"
              :src="appState.payload.result.capturePreviewDataUrl"
              alt="capture preview"
            />
          </section>

          <section class="details-block">
            <div class="card-label">执行信息</div>
            <dl class="detail-list">
              <div v-for="row in providerRows" :key="row.label" class="detail-row">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
              <div v-for="row in auditRows" :key="row.label" class="detail-row">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section v-if="diagnosticsText" class="details-block">
          <div class="card-label">诊断</div>
          <pre class="details-code">{{ diagnosticsText }}</pre>
        </section>

        <section v-if="showFailure" class="details-block details-block--error">
          <div class="card-label">错误详情</div>
          <pre class="details-code">{{ failureSummary }}</pre>
        </section>
      </div>
    </section>
  </main>
</template>
