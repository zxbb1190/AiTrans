const selectionBox = document.getElementById('selection-box');
const hintCopy = document.getElementById('hint-copy');

let activeDisplay = null;
let dragStart = null;
let dragCurrent = null;

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
  return {
    displayId: activeDisplay?.id ?? 'unknown',
    x: (activeDisplay?.bounds?.x || 0) + left,
    y: (activeDisplay?.bounds?.y || 0) + top,
    width,
    height,
    scaleFactor: activeDisplay?.scaleFactor ?? 1,
  };
}

window.aitransDesktop.onOverlayStart((payload) => {
  activeDisplay = payload.display;
  hintCopy.textContent = payload.hint;
  dragStart = null;
  dragCurrent = null;
  updateSelectionBox();
});

window.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) {
    return;
  }
  dragStart = { x: event.clientX, y: event.clientY };
  dragCurrent = { x: event.clientX, y: event.clientY };
  updateSelectionBox();
});

window.addEventListener('pointermove', (event) => {
  if (!dragStart) {
    return;
  }
  dragCurrent = { x: event.clientX, y: event.clientY };
  updateSelectionBox();
});

window.addEventListener('pointerup', async (event) => {
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
  await window.aitransDesktop.submitSelection(selection);
  dragStart = null;
  dragCurrent = null;
  updateSelectionBox();
});

window.addEventListener('keydown', async (event) => {
  if (event.key === 'Escape') {
    await window.aitransDesktop.cancelCapture('escape');
  }
});

window.addEventListener('contextmenu', async (event) => {
  event.preventDefault();
  await window.aitransDesktop.cancelCapture('right_click');
});
