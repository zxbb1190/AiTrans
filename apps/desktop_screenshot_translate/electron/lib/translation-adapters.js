const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';

const LANGUAGE_LABELS = {
  'zh-Hans': 'Simplified Chinese',
  zh: 'Chinese',
  en: 'English',
  ja: 'Japanese',
  auto: 'the detected source language',
};

function normalizeSourceText(sourceText) {
  if (typeof sourceText !== 'string') {
    return '';
  }
  return sourceText.trim();
}

function resolveTargetLanguage(productSpec) {
  const code = productSpec.pipeline.target_language;
  return LANGUAGE_LABELS[code] || code;
}

function extractResponseText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  if (!Array.isArray(payload.output)) {
    return '';
  }

  const fragments = [];
  for (const item of payload.output) {
    if (!item || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (content && typeof content.text === 'string' && content.text.trim()) {
        fragments.push(content.text.trim());
      }
    }
  }
  return fragments.join('\n').trim();
}

async function translateWithOpenAI(sourceText, productSpec, implementationConfig) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('missing OPENAI_API_KEY for openai_translation');
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1500, Math.min(productSpec.pipeline.timeout_budget_ms, 8000));
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: implementationConfig.providers.translation_model,
        instructions: [
          'You are a translation engine.',
          `Translate the user text into ${resolveTargetLanguage(productSpec)}.`,
          'Return only the translated text.',
          'Preserve line breaks and simple formatting where possible.',
          'Do not explain the translation.',
        ].join(' '),
        input: sourceText,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API ${response.status}: ${errorText}`);
    }

    const payload = await response.json();
    const translatedText = extractResponseText(payload);
    if (!translatedText) {
      throw new Error('OpenAI response did not contain translated text');
    }
    return {
      provider: 'openai_translation',
      translatedText,
      diagnostics: {
        model: implementationConfig.providers.translation_model,
        responseId: payload.id || null,
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function translateWithFallbackStub(sourceText, productSpec) {
  const normalized = normalizeSourceText(sourceText);
  return {
    provider: 'fallback_stub',
    translatedText: normalized
      ? `Stub Translation (${productSpec.pipeline.target_language}): ${normalized}`
      : 'OCR 未返回可翻译文本，当前未调用远端翻译 provider。',
    diagnostics: {
      reason: normalized ? 'fallback_stub_applied' : 'empty_source_text',
    },
  };
}

async function translateText(sourceText, productSpec, implementationConfig) {
  const normalizedSourceText = normalizeSourceText(sourceText);
  if (!normalizedSourceText) {
    return translateWithFallbackStub('', productSpec);
  }

  const failures = [];

  for (const provider of implementationConfig.providers.translation_chain) {
    try {
      if (provider === 'openai_translation') {
        return await translateWithOpenAI(normalizedSourceText, productSpec, implementationConfig);
      }
      if (provider === 'fallback_stub') {
        return await translateWithFallbackStub(normalizedSourceText, productSpec);
      }
      failures.push(`${provider}: unsupported provider`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${provider}: ${message}`);
    }
  }

  throw new Error(`no translation provider succeeded: ${failures.join(' | ')}`);
}

module.exports = {
  translateText,
};
