const anchor = document.getElementById('anchor');

const DRAG_THRESHOLD = 5;
let dragState = null;

anchor.addEventListener('mousedown', async (event) => {
  if (event.button !== 0) {
    return;
  }
  const response = await window.aitransDesktop.getAnchorBounds();
  if (!response?.ok || !response.bounds) {
    dragState = null;
    return;
  }
  dragState = {
    anchorX: response.bounds.x,
    anchorY: response.bounds.y,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    moved: false,
  };
});

window.addEventListener('mousemove', async (event) => {
  if (!dragState) {
    return;
  }
  const deltaX = event.screenX - dragState.startScreenX;
  const deltaY = event.screenY - dragState.startScreenY;
  if (!dragState.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
    dragState.moved = true;
  }
  if (!dragState.moved) {
    return;
  }
  await window.aitransDesktop.setAnchorPosition({
    x: dragState.anchorX + deltaX,
    y: dragState.anchorY + deltaY,
  });
});

window.addEventListener('mouseup', async () => {
  if (!dragState) {
    return;
  }
  const shouldToggle = !dragState.moved;
  dragState = null;
  if (shouldToggle) {
    await window.aitransDesktop.toggleChatWindow();
  }
});

window.addEventListener('mouseleave', () => {
  if (!dragState?.moved) {
    return;
  }
  dragState = null;
});

window.addEventListener('contextmenu', async (event) => {
  event.preventDefault();
  dragState = null;
  await window.aitransDesktop.openEntryMenu();
});
