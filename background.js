/* TweetShot service worker (Chrome) / background script (Firefox).
 *
 * The action button has a popup, so `action.onClicked` never fires here; the
 * popup and the right-click menu ask us to open the editor through messages.
 */
const ext = typeof browser !== 'undefined' && browser.runtime ? browser : chrome;

const EDIT_MENU_ID = 'txe-edit-image';

function ensureMenus() {
  if (!ext.contextMenus) return;
  ext.contextMenus.removeAll(() => {
    ext.contextMenus.create({
      id: EDIT_MENU_ID,
      title: ext.i18n ? ext.i18n.getMessage('ctxEdit') || 'Edit this image with TweetShot' : 'Edit this image with TweetShot',
      contexts: ['image'],
      // scoped to the sites we already have host access to, so the content
      // script can always fetch the clicked image without broader permissions
      documentUrlPatterns: ['https://x.com/*', 'https://twitter.com/*'],
    });
  });
}

function openEditor(src) {
  const path = src ? 'editor/editor.html?src=' + encodeURIComponent(src) : 'editor/editor.html';
  ext.tabs.create({ url: ext.runtime.getURL(path) }).catch(() => {});
}

// Resolves true when a content script actually received the message.
function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const ret = ext.tabs.sendMessage(tabId, msg, () => {
        done(!ext.runtime.lastError);
      });
      if (ret && typeof ret.then === 'function') {
        ret.then(() => done(true)).catch(() => done(false));
      } else if (ret === undefined) {
        // Chrome callback path already handled it; guard against a silent no-op
        setTimeout(() => done(true), 400);
      }
    } catch {
      done(false);
    }
  });
}

ext.runtime.onInstalled.addListener((details) => {
  ensureMenus();
  if (details.reason === 'install') openEditor();
});
ext.runtime.onStartup?.addListener(ensureMenus);

ext.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== EDIT_MENU_ID || !info.srcUrl) return;
  const delivered = tab && tab.id != null ? await sendToTab(tab.id, { type: 'TXE_EDIT_IMAGE', srcUrl: info.srcUrl }) : false;
  if (!delivered) openEditor(info.srcUrl);
});

ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'TXE_OPEN_EDITOR') {
    openEditor(msg.src);
    sendResponse({ ok: true });
  }
  return false;
});
