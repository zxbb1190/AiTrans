<script setup>
import { computed, reactive } from 'vue';

function createEmptyPayload() {
  return {
    product: {
      displayName: 'ArchSync 截图翻译',
      copy: {
        copy_success: '译文已复制',
        empty_translation: '完成截图后将在此显示译文。',
      },
    },
    result: {
      stageStatus: 'idle',
      errorOrigin: null,
      capturePreviewDataUrl: null,
      sourceText: '尚未捕获结果',
      translatedText: '完成截图后将在此显示译文结果。',
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
});

const statusText = computed(() => appState.payload.result.stageStatus || 'idle');
const selectionText = computed(() => {
  const selection = appState.payload.result.selection;
  return `区域：${selection.width} x ${selection.height}`;
});
const shortcutText = computed(() => `快捷键：${appState.payload.result.shortcut}`);
const providerText = computed(() => {
  const meta = appState.payload.result.captureMeta;
  if (!meta) {
    return '';
  }
  return `OCR: ${meta.ocrProvider} / TRANS: ${meta.translationProvider}`;
});
const isBusy = computed(() =>
  ['capturing', 'ocr_processing', 'translation_processing'].includes(appState.payload.result.stageStatus),
);
const canCopy = computed(() => !isBusy.value && Boolean(appState.payload.result.translatedText));

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

async function handleClose() {
  await window.aitransDesktop.closePanel();
}

async function handleRecapture() {
  await window.aitransDesktop.recapture();
}

window.aitransDesktop.onPanelData((payload) => {
  appState.payload = payload;
  appState.copyButtonLabel = '复制译文';
});

window.aitransDesktop.getProjectSummary().then((summary) => {
  if (appState.payload.result.stageStatus === 'idle') {
    appState.payload.result.shortcut = summary.shortcut;
  }
});
</script>

<template>
  <main class="panel-shell">
    <section class="panel-header">
      <div>
        <div class="eyebrow">Windows MVP · Vue SFC Panel</div>
        <h1>{{ appState.payload.product.displayName }}</h1>
      </div>
      <button class="ghost-btn" @click="handleClose">关闭</button>
    </section>

    <section class="status-card">
      <div class="status-label">当前状态</div>
      <div class="status-value">{{ statusText }}</div>
      <div v-if="appState.payload.result.errorOrigin" class="status-error">
        错误来源：{{ appState.payload.result.errorOrigin }}
      </div>
    </section>

    <section class="preview-card">
      <div class="content-label">截图预览</div>
      <img
        v-if="appState.payload.result.capturePreviewDataUrl"
        class="preview-image"
        :src="appState.payload.result.capturePreviewDataUrl"
        alt="capture preview"
      />
      <div v-else class="preview-empty">完成截图后，这里会显示本地裁剪预览。</div>
    </section>

    <section class="content-grid">
      <article class="content-card">
        <div class="content-label">原文</div>
        <pre class="content-body">{{ appState.payload.result.sourceText || '暂无原文' }}</pre>
      </article>
      <article class="content-card">
        <div class="content-label">译文</div>
        <pre class="content-body">{{ appState.payload.result.translatedText || appState.payload.product.copy.empty_translation }}</pre>
      </article>
    </section>

    <section class="meta-row">
      <div class="meta-chip">{{ selectionText }}</div>
      <div class="meta-chip">{{ shortcutText }}</div>
      <div v-if="providerText" class="meta-chip">{{ providerText }}</div>
    </section>

    <section class="action-row">
      <button class="primary-btn" :disabled="!canCopy" @click="handleCopy">
        {{ isBusy ? '处理中…' : appState.copyButtonLabel }}
      </button>
      <button class="secondary-btn" :disabled="isBusy" @click="handleRecapture">重新截图</button>
    </section>
  </main>
</template>
