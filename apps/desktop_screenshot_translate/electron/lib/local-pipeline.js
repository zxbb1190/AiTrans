const { desktopCapturer, screen } = require('electron');
const { recognizeText } = require('./ocr-adapters');
const { translateText } = require('./translation-adapters');

function clampRect(rect, maxWidth, maxHeight) {
  const x = Math.max(0, Math.min(rect.x, Math.max(0, maxWidth - 1)));
  const y = Math.max(0, Math.min(rect.y, Math.max(0, maxHeight - 1)));
  const width = Math.max(1, Math.min(rect.width, maxWidth - x));
  const height = Math.max(1, Math.min(rect.height, maxHeight - y));
  return { x, y, width, height };
}

function resolveDisplay(displayId) {
  const allDisplays = screen.getAllDisplays();
  return allDisplays.find((item) => String(item.id) === String(displayId)) || screen.getPrimaryDisplay();
}

function toPhysicalRect(rect) {
  if (typeof screen.dipToScreenRect === 'function') {
    return screen.dipToScreenRect(null, rect);
  }
  return rect;
}

async function captureSelectionImage(selection) {
  const display = resolveDisplay(selection.displayId);
  const displayDipRect = {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
  };
  const displayPhysicalRect = toPhysicalRect(displayDipRect);
  const selectionPhysicalRect = toPhysicalRect({
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height,
  });

  const thumbnailSize = {
    width: Math.max(1, Math.round(displayPhysicalRect.width)),
    height: Math.max(1, Math.round(displayPhysicalRect.height)),
  };
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize,
    fetchWindowIcons: false,
  });
  const source =
    sources.find((item) => String(item.display_id || '') === String(display.id)) ||
    sources[0];
  if (!source) {
    throw new Error('no desktop capture source available');
  }

  const cropRect = clampRect(
    {
      x: Math.round(selectionPhysicalRect.x - displayPhysicalRect.x),
      y: Math.round(selectionPhysicalRect.y - displayPhysicalRect.y),
      width: Math.round(selectionPhysicalRect.width),
      height: Math.round(selectionPhysicalRect.height),
    },
    source.thumbnail.getSize().width,
    source.thumbnail.getSize().height,
  );
  const croppedImage = source.thumbnail.crop(cropRect);
  return {
    display,
    cropRect,
    size: croppedImage.getSize(),
    pngBuffer: croppedImage.toPNG(),
    pngBase64: croppedImage.toPNG().toString('base64'),
    dataUrl: croppedImage.toDataURL(),
  };
}

module.exports = {
  captureSelectionImage,
  recognizeText,
  translateText,
};
