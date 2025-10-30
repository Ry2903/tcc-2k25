// background.js (service worker)
console.log('background service worker running (diagnostic)');

chrome.runtime.onInstalled.addListener(() => {
  console.log('sw install');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('sw start');
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab || !tab.id || !tab.url) {
      console.warn('[Blink] ação clicada mas aba inválida', tab);
      return;
    }
    const url = tab.url || '';
    // Proteção: não tentar injetar em páginas internas do browser (chrome://)
    if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
      console.warn('[Blink] tentativa de injeção em URL não permitida:', url);
      // opcional: notificar o usuário via chrome.notifications (não incluí aqui)
      return;
    }

    console.log(`[Blink] tentando injetar overlay em tab ${tab.id} ${url}`);

    // injeta o content_inject.js que cria um iframe apontando para ui/ui.html
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content_inject.js']
    });

    return;
  } catch (err) {
    console.error('[Blink] script injection failed:', err);
  }
});

// permitimos mensagens vindas do UI (iframe) -> por exemplo pedido de fechar overlay
chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'remove-overlay') {
    // executar em sender.tab para remover (sender.tab may be undefined if message from extension page)
    const tabId = sender.tab && sender.tab.id;
    if (tabId) {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const root = document.getElementById('blink-extension-root');
          if (root) root.remove();
        }
      }).then(() => sendResp({ ok: true })).catch(() => sendResp({ ok: false }));
      // indicate async response
      return true;
    }
  }
});