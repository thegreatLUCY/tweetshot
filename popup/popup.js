const ext = typeof browser !== 'undefined' && browser.runtime ? browser : chrome;

function openEditor() {
  // Ask the service worker so the background script stays the single entry
  // point for opening the full editor.
  ext.runtime.sendMessage({ type: 'TXE_OPEN_EDITOR' }, () => {
    if (ext.runtime.lastError) ext.tabs.create({ url: ext.runtime.getURL('editor/editor.html') });
  });
}

document.getElementById('openFull').addEventListener('click', openEditor);
document.getElementById('goX').addEventListener('click', () => {
  ext.tabs.create({ url: 'https://x.com/compose/post' });
});
