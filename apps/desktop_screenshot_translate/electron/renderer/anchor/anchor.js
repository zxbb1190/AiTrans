const anchor = document.getElementById('anchor');

anchor.addEventListener('click', async () => {
  await window.aitransDesktop.toggleChatWindow();
});

window.addEventListener('contextmenu', async (event) => {
  event.preventDefault();
  await window.aitransDesktop.openEntryMenu();
});
