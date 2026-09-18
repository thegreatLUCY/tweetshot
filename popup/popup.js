const ext =
  typeof browser !== 'undefined' && browser.runtime
    ? browser
    : typeof chrome !== 'undefined' && chrome.runtime
      ? chrome
      : null;

function openEditor() {
  // Ask the service worker so the background script stays the single entry
  // point for opening the full editor.
  if (!ext) return;
  ext.runtime.sendMessage({ type: 'TXE_OPEN_EDITOR' }, () => {
    if (ext.runtime.lastError) ext.tabs.create({ url: ext.runtime.getURL('editor/editor.html') });
  });
}

function goToX() {
  const url = 'https://x.com/compose/post';
  if (!ext) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  ext.tabs.create({ url });
}

document.getElementById('openFull').addEventListener('click', openEditor);
document.getElementById('goX').addEventListener('click', goToX);
