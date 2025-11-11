console.log('background service worker running (diagnostic)');

chrome.runtime.onInstalled.addListener(() => {
  console.log('sw install');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('sw start');
});

// ========== PERSISTÊNCIA DE ESTADO ==========
const STATE_KEY = 'blink_extension_state';
const ACTIVE_TABS_KEY = 'blink_active_tabs'; // Rastreia abas onde extensão está ativa

// Salva estado
async function saveState(state) {
  try {
    await chrome.storage.local.set({ [STATE_KEY]: state });
    console.log('[Background] Estado salvo:', state);
  } catch (err) {
    console.error('[Background] Erro ao salvar estado:', err);
  }
}

// Carrega estado
async function loadState() {
  try {
    const result = await chrome.storage.local.get(STATE_KEY);
    return result[STATE_KEY] || null;
  } catch (err) {
    console.error('[Background] Erro ao carregar estado:', err);
    return null;
  }
}

// Marca aba como ativa
async function markTabActive(tabId) {
  try {
    const result = await chrome.storage.local.get(ACTIVE_TABS_KEY);
    const activeTabs = result[ACTIVE_TABS_KEY] || {};
    activeTabs[tabId] = Date.now();
    await chrome.storage.local.set({ [ACTIVE_TABS_KEY]: activeTabs });
    console.log('[Background] Aba marcada como ativa:', tabId);
  } catch (err) {
    console.error('[Background] Erro ao marcar aba:', err);
  }
}

// Verifica se aba está ativa
async function isTabActive(tabId) {
  try {
    const result = await chrome.storage.local.get(ACTIVE_TABS_KEY);
    const activeTabs = result[ACTIVE_TABS_KEY] || {};
    return !!activeTabs[tabId];
  } catch (err) {
    return false;
  }
}

// Remove aba do rastreamento
async function removeTabFromActive(tabId) {
  try {
    const result = await chrome.storage.local.get(ACTIVE_TABS_KEY);
    const activeTabs = result[ACTIVE_TABS_KEY] || {};
    delete activeTabs[tabId];
    await chrome.storage.local.set({ [ACTIVE_TABS_KEY]: activeTabs });
    console.log('[Background] Aba removida do rastreamento:', tabId);
  } catch (err) {
    console.error('[Background] Erro ao remover aba:', err);
  }
}

// Função auxiliar para verificar se pode injetar
function canInjectInTab(tab) {
  if (!tab || !tab.url) return false;
  const url = tab.url;
  
  // URLs onde não pode injetar (restrições de segurança do Chrome)
  if (url.startsWith('chrome://') || 
      url.startsWith('edge://') || 
      url.startsWith('about:') ||
      url.startsWith('chrome-extension://') ||
      url === 'chrome://newtab/' ||
      url.includes('chrome.google.com/webstore')) {
    return false;
  }
  
  return true;
}

// Função para verificar se extensão já está injetada
async function isExtensionInjected(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!document.getElementById('blink-extension-root')
    });
    return results && results[0] && results[0].result;
  } catch (e) {
    return false;
  }
}

// Função para injetar extensão com retry
async function injectExtension(tabId, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content_inject.js']
      });
      console.log('[Background] ✅ Extensão injetada na aba:', tabId);
      await markTabActive(tabId);
      return true;
    } catch (err) {
      console.warn(`[Background] Tentativa ${i + 1}/${retries} falhou:`, err.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  console.error('[Background] ❌ Falha ao injetar após', retries, 'tentativas');
  return false;
}

// ========== MONITORAMENTO DE NAVEGAÇÃO ==========
// Monitora quando a página completa o carregamento
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Só age quando a página terminou de carregar
  if (changeInfo.status === 'complete') {
    // Verifica se esta aba estava ativa
    const wasActive = await isTabActive(tabId);
    
    if (wasActive) {
      console.log('[Background] 🔄 Página recarregada/navegada na aba ativa:', tabId, tab.url);
      
      // Verifica se pode injetar na nova URL
      if (!canInjectInTab(tab)) {
        console.warn('[Background] ⚠️ Não pode injetar na URL:', tab.url);
        await removeTabFromActive(tabId);
        return;
      }

      // Verifica se já está injetada
      const alreadyInjected = await isExtensionInjected(tabId);
      
      if (!alreadyInjected) {
        console.log('[Background] 🔧 Reinjetando extensão...');
        await injectExtension(tabId);
      } else {
        console.log('[Background] ✅ Extensão já presente');
      }
    }
  }
});

// Remove aba do rastreamento quando for fechada
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await removeTabFromActive(tabId);
});

// Gerenciamento do clique no ícone da extensão
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab || !tab.id || !tab.url) {
      console.warn('[Blink] ação clicada mas aba inválida', tab);
      return;
    }

    // Verifica se pode injetar
    if (!canInjectInTab(tab)) {
      console.warn('[Blink] tentativa de injeção em URL não permitida:', tab.url);
      // Tenta criar uma nova aba com Google
      chrome.tabs.create({ url: 'https://www.google.com', active: true }, async (newTab) => {
        // Aguarda carregar
        chrome.tabs.onUpdated.addListener(function listener(tId, info) {
          if (tId === newTab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            injectExtension(newTab.id);
          }
        });
      });
      return;
    }

    console.log(`[Blink] tentando injetar overlay em tab ${tab.id} ${tab.url}`);

    // Verifica se já está injetada
    const alreadyInjected = await isExtensionInjected(tab.id);
    
    if (alreadyInjected) {
      console.log('[Blink] Extensão já injetada, removendo...');
      // Remove se já estiver injetada (toggle)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const root = document.getElementById('blink-extension-root');
          if (root) root.remove();
        }
      });
      await removeTabFromActive(tab.id);
    } else {
      // Injeta
      await injectExtension(tab.id);
    }
  } catch (err) {
    console.error('[Blink] script injection failed:', err);
  }
});

// ========== MENSAGENS ==========
chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  if (!msg || !msg.type) return;

  console.log('[Background] Mensagem recebida:', msg.type, msg);

  if (msg.type === 'save-state') {
    saveState(msg.state).then(() => sendResp({ ok: true }));
    return true;
  }

  if (msg.type === 'load-state') {
    loadState().then(state => sendResp({ ok: true, state }));
    return true;
  }

  // Marca aba como ativa (chamado quando extensão é aberta)
  if (msg.type === 'extension-opened') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId) {
      markTabActive(tabId).then(() => sendResp({ ok: true }));
      return true;
    }
  }

  // Remove extensão e desmarca aba
  if (msg.type === 'remove-overlay') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId) {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const root = document.getElementById('blink-extension-root');
          if (root) root.remove();
        }
      }).then(() => {
        removeTabFromActive(tabId);
        sendResp({ ok: true });
      }).catch(() => sendResp({ ok: false }));
      return true;
    }
  }

  // Abrir nova aba
  if (msg.type === 'open-new-tab') {
    chrome.tabs.create({
      url: msg.url || 'https://www.google.com',
      active: true
    }).then(tab => {
      console.log('[Background] Nova aba criada:', tab.id);

      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          injectExtension(tab.id).then(() => {
            sendResp({ ok: true, tabId: tab.id });
          });
        }
      });
    }).catch(err => {
      console.error('[Background] Erro ao criar aba:', err);
      sendResp({ ok: false, error: err.message });
    });
    return true;
  }

  // Navegar para aba anterior (esquerda)
  if (msg.type === 'tab-previous') {
    chrome.tabs.query({ currentWindow: true }, async (tabs) => {
      if (tabs.length <= 1) {
        sendResp({ ok: false, message: 'Apenas uma aba aberta' });
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, async (activeTabs) => {
        const currentTab = activeTabs[0];
        const currentIndex = tabs.findIndex(t => t.id === currentTab.id);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        const prevTab = tabs[prevIndex];

        if (!canInjectInTab(prevTab)) {
          console.warn('[Background] Não pode injetar na aba:', prevTab.url);
          sendResp({ ok: false, message: 'Extensão não pode ser executada nesta página' });
          return;
        }

        await chrome.tabs.update(prevTab.id, { active: true });
        console.log('[Background] Mudou para aba anterior:', prevTab.id);

        if (prevTab.status !== 'complete') {
          await new Promise(resolve => {
            const listener = (tabId, info) => {
              if (tabId === prevTab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
          });
        }

        const alreadyInjected = await isExtensionInjected(prevTab.id);
        
        if (!alreadyInjected) {
          await injectExtension(prevTab.id);
        }

        sendResp({ ok: true, tabId: prevTab.id });
      });
    });
    return true;
  }

  // Navegar para próxima aba (direita)
  if (msg.type === 'tab-next') {
    chrome.tabs.query({ currentWindow: true }, async (tabs) => {
      if (tabs.length <= 1) {
        sendResp({ ok: false, message: 'Apenas uma aba aberta' });
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, async (activeTabs) => {
        const currentTab = activeTabs[0];
        const currentIndex = tabs.findIndex(t => t.id === currentTab.id);
        const nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        const nextTab = tabs[nextIndex];

        if (!canInjectInTab(nextTab)) {
          console.warn('[Background] Não pode injetar na aba:', nextTab.url);
          sendResp({ ok: false, message: 'Extensão não pode ser executada nesta página' });
          return;
        }

        await chrome.tabs.update(nextTab.id, { active: true });
        console.log('[Background] Mudou para próxima aba:', nextTab.id);

        if (nextTab.status !== 'complete') {
          await new Promise(resolve => {
            const listener = (tabId, info) => {
              if (tabId === nextTab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
          });
        }

        const alreadyInjected = await isExtensionInjected(nextTab.id);
        
        if (!alreadyInjected) {
          await injectExtension(nextTab.id);
        }

        sendResp({ ok: true, tabId: nextTab.id });
      });
    });
    return true;
  }

  // Fechar aba atual
  if (msg.type === 'close-current-tab') {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      if (tabs.length <= 1) {
        sendResp({ ok: false, message: 'Não pode fechar a última aba' });
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, async (activeTabs) => {
        const currentTab = activeTabs[0];
        await removeTabFromActive(currentTab.id);
        chrome.tabs.remove(currentTab.id, () => {
          console.log('[Background] Aba fechada:', currentTab.id);
          sendResp({ ok: true });
        });
      });
    });
    return true;
  }
});