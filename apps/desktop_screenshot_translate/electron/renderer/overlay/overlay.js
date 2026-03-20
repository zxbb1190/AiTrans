const selectionBox = document.getElementById('selection-box');
const hintCopy = document.getElementById('hint-copy');

let activeDisplay = null;
let availableDisplays = [];
let overlayBounds = null;
let dragStart = null;
let dragCurrent = null;
let availableModes = [];
let interactionLocked = false;

function updateSelectionBox() {
  if (!dragStart || !dragCurrent) {
    selectionBox.classList.add('hidden');
    return;
  }
  const left = Math.min(dragStart.x, dragCurrent.x);
  const top = Math.min(dragStart.y, dragCurrent.y);
  const width = Math.abs(dragCurrent.x - dragStart.x);
  const height = Math.abs(dragCurrent.y - dragStart.y);

  selectionBox.classList.remove('hidden');
  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
}

function buildSelection() {
  const left = Math.min(dragStart.x, dragCurrent.x);
  const top = Math.min(dragStart.y, dragCurrent.y);
  const width = Math.abs(dragCurrent.x - dragStart.x);
  const height = Math.abs(dragCurrent.y - dragStart.y);
  const absoluteX = (overlayBounds?.x || 0) + left;
  const absoluteY = (overlayBounds?.y || 0) + top;
  const centerPoint = {
    x: absoluteX + Math.max(1, width) / 2,
    y: absoluteY + Math.max(1, height) / 2,
  };
  const targetDisplay = resolveDisplayForScreenPoint(centerPoint.x, centerPoint.y) || activeDisplay;
  return {
    displayId: targetDisplay?.id ?? activeDisplay?.id ?? 'unknown',
    x: absoluteX,
    y: absoluteY,
    width,
    height,
    scaleFactor: targetDisplay?.scaleFactor ?? activeDisplay?.scaleFactor ?? 1,
  };
}

function supportsMode(mode) {
  return Array.isArray(availableModes) && availableModes.includes(mode);
}

function buildFullscreenSelection() {
  const targetDisplay = activeDisplay || availableDisplays[0] || null;
  return {
    displayId: targetDisplay?.id ?? 'unknown',
    x: targetDisplay?.bounds?.x || 0,
    y: targetDisplay?.bounds?.y || 0,
    width: targetDisplay?.bounds?.width || window.innerWidth,
    height: targetDisplay?.bounds?.height || window.innerHeight,
    scaleFactor: targetDisplay?.scaleFactor ?? 1,
  };
}

function resolveDisplayForScreenPoint(screenX, screenY) {
  return availableDisplays.find((item) => {
    const bounds = item?.bounds;
    return bounds
      && screenX >= bounds.x
      && screenX < bounds.x + bounds.width
      && screenY >= bounds.y
      && screenY < bounds.y + bounds.height;
  }) || null;
}

function updateActiveDisplayFromPointer(event) {
  const nextDisplay = resolveDisplayForScreenPoint(event.screenX, event.screenY);
  if (nextDisplay) {
    activeDisplay = nextDisplay;
  }
}

window.aitransDesktop.onOverlayStart((payload) => {
  activeDisplay = payload.display;
  availableDisplays = Array.isArray(payload.displays) ? payload.displays : (payload.display ? [payload.display] : []);
  overlayBounds = payload.overlayBounds || null;
  availableModes = Array.isArray(payload.modes) ? payload.modes : [];
  interactionLocked = false;
  hintCopy.textContent = payload.hint;
  dragStart = null;
  dragCurrent = null;
  updateSelectionBox();
});

window.addEventListener('pointerdown', (event) => {
  if (interactionLocked) {
    return;
  }
  if (event.button !== 0) {
    return;
  }
  updateActiveDisplayFromPointer(event);
  dragStart = { x: event.clientX, y: event.clientY };
  dragCurrent = { x: event.clientX, y: event.clientY };
  updateSelectionBox();
});

window.addEventListener('pointermove', (event) => {
  if (interactionLocked) {
    return;
  }
  updateActiveDisplayFromPointer(event);
  if (!dragStart) {
    return;
  }
  dragCurrent = { x: event.clientX, y: event.clientY };
  updateSelectionBox();
});

window.addEventListener('pointerup', async (event) => {
  if (interactionLocked) {
    return;
  }
  if (!dragStart || event.button !== 0) {
    return;
  }
  dragCurrent = { x: event.clientX, y: event.clientY };
  const selection = buildSelection();
  if (selection.width < 12 || selection.height < 12) {
    dragStart = null;
    dragCurrent = null;
    updateSelectionBox();
    return;
  }
  interactionLocked = true;
  await window.aitransDesktop.submitSelection(selection);
  dragStart = null;
  dragCurrent = null;
  updateSelectionBox();
});

window.addEventListener('keydown', async (event) => {
  if (interactionLocked) {
    return;
  }
  if (event.key === 'Escape') {
    interactionLocked = true;
    await window.aitransDesktop.cancelCapture('escape');
    return;
  }
  if (event.key === 'Enter' && supportsMode('fullscreen')) {
    interactionLocked = true;
    await window.aitransDesktop.submitSelection(buildFullscreenSelection());
  }
});

window.addEventListener('contextmenu', async (event) => {
  if (interactionLocked) {
    return;
  }
  event.preventDefault();
  interactionLocked = true;
  await window.aitransDesktop.cancelCapture('right_click');
});

window.addEventListener('dblclick', async () => {
  if (interactionLocked) {
    return;
  }
  if (!supportsMode('fullscreen')) {
    return;
  }
  interactionLocked = true;
  await window.aitransDesktop.submitSelection(buildFullscreenSelection());
});
