console.log('background service worker running (diagnostic)');

chrome.runtime.onInstalled.addListener(() => {
  console.log('sw install');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('sw start');
});

// ----------------------
// Storage helpers (promisified)
// ----------------------
function storageGet(keyOrKeys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keyOrKeys, (result) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve(result);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function storageSet(obj) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(obj, () => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ----------------------
// KEYS / PERSISTÊNCIA
// ----------------------
const STATE_KEY = 'blink_extension_state';
const ACTIVE_TABS_KEY = 'blink_active_tabs';
const CAMERA_PREF_KEY = 'blink_camera_prefs';
const SETUP_COMPLETED_KEY = 'blink_setup_completed'; // ✅ NOVO: estado global de setup

/** ✅ NOVO: Verifica se setup foi completado (global, não por aba) */
async function isSetupCompleted() {
  try {
    const result = await storageGet(SETUP_COMPLETED_KEY);
    return !!result[SETUP_COMPLETED_KEY];
  } catch (err) {
    console.warn('[Background] isSetupCompleted error', err);
    return false;
  }
}

/** ✅ NOVO: Marca setup como completado */
async function markSetupCompleted() {
  try {
    await storageSet({ [SETUP_COMPLETED_KEY]: true });
    console.log('[Background] ✅ Setup marcado como completado');
  } catch (err) {
    console.error('[Background] markSetupCompleted error', err);
    throw err;
  }
}

/** grava preferência de câmera para uma aba */
async function saveCameraPreferenceForTab(tabId, enabled) {
  try {
    const result = await storageGet(CAMERA_PREF_KEY);
    const prefs = result[CAMERA_PREF_KEY] || {};
    prefs[String(tabId)] = !!enabled;
    await storageSet({ [CAMERA_PREF_KEY]: prefs });
    console.log('[Background] saved camera pref for tab', tabId, enabled);
  } catch (err) {
    console.warn('[Background] saveCameraPreferenceForTab error', err);
    throw err;
  }
}

/** lê preferência */
async function getCameraPrefForTab(tabId) {
  try {
    const result = await storageGet(CAMERA_PREF_KEY);
    const prefs = result[CAMERA_PREF_KEY] || {};
    return !!prefs[String(tabId)];
  } catch (err) {
    console.warn('[Background] getCameraPrefForTab error', err);
    return false;
  }
}

/** marca aba ativa */
async function markTabActive(tabId) {
  try {
    const result = await storageGet(ACTIVE_TABS_KEY);
    const activeTabs = result[ACTIVE_TABS_KEY] || {};
    activeTabs[String(tabId)] = Date.now();
    await storageSet({ [ACTIVE_TABS_KEY]: activeTabs });
    console.log('[Background] Aba marcada como ativa:', tabId);
  } catch (err) {
    console.error('[Background] Erro ao marcar aba:', err);
    throw err;
  }
}

/** checa se aba está ativa */
async function isTabActive(tabId) {
  try {
    const result = await storageGet(ACTIVE_TABS_KEY);
    const activeTabs = result[ACTIVE_TABS_KEY] || {};
    return !!activeTabs[String(tabId)];
  } catch (err) {
    console.warn('[Background] isTabActive error', err);
    return false;
  }
}

/** remove do rastreamento */
async function removeTabFromActive(tabId) {
  try {
    const result = await storageGet(ACTIVE_TABS_KEY);
    const activeTabs = result[ACTIVE_TABS_KEY] || {};
    delete activeTabs[String(tabId)];
    await storageSet({ [ACTIVE_TABS_KEY]: activeTabs });
    console.log('[Background] Aba removida do rastreamento:', tabId);
  } catch (err) {
    console.error('[Background] Erro ao remover aba:', err);
    throw err;
  }
}

// ----------------------
// HELPERS DE INJEÇÃO / CAN INJECT
// ----------------------
function canInjectInTab(tab) {
  if (!tab || !tab.url) return false;
  const url = tab.url;
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

/** ✅ ATUALIZADO: injeta e decide se inicia câmera */
async function injectExtension(tabId, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content_inject.js']
      });
      console.log('[Background] ✅ Extensão injetada na aba:', tabId);
      await markTabActive(tabId);

      // ✅ Atualizar aba ativa atual
      currentActiveTabId = tabId;

      try {
        const setupDone = await isSetupCompleted();
        const cameraPref = await getCameraPrefForTab(tabId);
        
        console.log('[Background] 🔍 Estado:', { setupDone, cameraPref, tabId });

        if (setupDone && cameraPref) {
          console.log('[Background] 📸 Enviando start-camera');
          setTimeout(() => {
            sendCommandToIframe(tabId, { type: 'blink:command', command: 'start-camera' });
          }, 1000); // ✅ Aumentado para 1s
        } else {
          console.log('[Background] ⏸️ Setup incompleto ou câmera desabilitada');
        }
      } catch (e) {
        console.warn('[Background] erro ao decidir iniciar camera', e);
      }

      return true;
    } catch (err) {
      console.warn(`[Background] Tentativa ${i + 1}/${retries} falhou:`, err && err.message);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 500));
    }
  }
  console.error('[Background] ❌ Falha ao injetar após', retries, 'tentativas');
  return false;
}

/** Envia comando para iframe dentro da página */
async function sendCommandToIframe(tabId, commandObj = { type: 'blink:command', command: 'start-camera' }, attempts = 8, delayMs = 400) {
  for (let i = 0; i < attempts; i++) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (msg) => {
          try {
            const iframe = document.getElementById('blink-extension-iframe');
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage(msg, '*');
              return { ok: true };
            }
            return { ok: false, reason: 'no-iframe' };
          } catch (e) {
            return { ok: false, reason: 'exception' };
          }
        },
        args: [commandObj]
      });

      if (results && results[0] && results[0].result && results[0].result.ok) {
        console.log('[Background] ✅ enviado comando para iframe em tab', tabId, commandObj);
        return true;
      } else {
        await new Promise(r => setTimeout(r, delayMs));
      }
    } catch (err) {
      console.warn('[Background] falha ao enviar comando (tentativa):', err && err.message);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  console.warn('[Background] ❌ não conseguiu enviar comando ao iframe após tentativas:', tabId, commandObj);
  return false;
}

// ----------------------
// PERSISTÊNCIA DE ESTADO
// ----------------------
async function saveState(state) {
  try {
    await storageSet({ [STATE_KEY]: state });
    console.log('[Background] Estado salvo:', state);
  } catch (err) {
    console.error('[Background] Erro ao salvar estado:', err);
    throw err;
  }
}

async function loadState() {
  try {
    const result = await storageGet(STATE_KEY);
    return result[STATE_KEY] || null;
  } catch (err) {
    console.error('[Background] Erro ao carregar estado:', err);
    return null;
  }
}

// ----------------------
// MONITORAMENTO DE NAVEGAÇÃO
// ----------------------
if (chrome.webNavigation && chrome.webNavigation.onHistoryStateUpdated) {
  chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
    try {
      const tabId = details.tabId;
      if (!tabId) return;
      const wasActive = await isTabActive(tabId);
      if (!wasActive) return;

      console.log('[Background] onHistoryStateUpdated para aba ativa:', tabId, details.url);

      const tab = await new Promise(resolve => chrome.tabs.get(tabId, (t) => resolve(t)));
      if (!tab || !canInjectInTab(tab)) {
        await removeTabFromActive(tabId);
        return;
      }

      const alreadyInjected = await isExtensionInjected(tabId);
      if (!alreadyInjected) {
        console.log('[Background] Reinjetando devido a history state update...');
        await injectExtension(tabId);
      } else {
        // ✅ Só reinicia câmera se setup completo
        const setupDone = await isSetupCompleted();
        const shouldBeOn = await getCameraPrefForTab(tabId);
        if (setupDone && shouldBeOn) {
          console.log('[Background] 📸 Reiniciando câmera após navegação SPA');
          setTimeout(() => sendCommandToIframe(tabId, { type: 'blink:command', command: 'start-camera' }), 800);
        }
      }
    } catch (err) {
      console.warn('[Background] onHistoryStateUpdated error', err);
    }
  });
}

// ✅ NOVO: Gerenciamento de aba ativa atual
let currentActiveTabId = null;

// ✅ NOVO: Listener para mudanças de aba ativa
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const newTabId = activeInfo.tabId;
  const oldTabId = currentActiveTabId;
  
  console.log('[Background] 🔄 Aba ativada:', newTabId, 'anterior:', oldTabId);
  
  currentActiveTabId = newTabId;
  
  // Verificar se nova aba tem extensão injetada
  const isActive = await isTabActive(newTabId);
  
  if (isActive) {
    console.log('[Background] ✅ Nova aba tem extensão');
    
    // Verificar se setup está completo
    const setupDone = await isSetupCompleted();
    const cameraPref = await getCameraPrefForTab(newTabId);
    
    if (setupDone && cameraPref) {
      console.log('[Background] 📸 Reiniciando câmera na nova aba');
      
      // Dar tempo para aba ativar
      setTimeout(() => {
        sendCommandToIframe(newTabId, { 
          type: 'blink:command', 
          command: 'start-camera' 
        });
      }, 500);
    }
  }
});

// tabs.onUpdated (full navigation / reload)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const wasActive = await isTabActive(tabId);

    if (wasActive) {
      console.log('[Background] 🔄 Página recarregada/navegada na aba ativa:', tabId, tab.url);

      if (!canInjectInTab(tab)) {
        console.warn('[Background] ⚠️ Não pode injetar na URL:', tab.url);
        await removeTabFromActive(tabId);
        return;
      }

      const alreadyInjected = await isExtensionInjected(tabId);

      if (!alreadyInjected) {
        console.log('[Background] 🔧 Reinjetando extensão...');
        await injectExtension(tabId);
      } else {
        console.log('[Background] ✅ Extensão já presente');
        
        // ✅ Reinicia câmera apenas se setup completo
        const setupDone = await isSetupCompleted();
        const shouldBeOn = await getCameraPrefForTab(tabId);
        if (setupDone && shouldBeOn) {
          console.log('[Background] 📸 Reiniciando câmera após reload');
          setTimeout(() => {
            sendCommandToIframe(tabId, { type: 'blink:command', command: 'start-camera' });
          }, 800);
        }
      }
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await removeTabFromActive(tabId);
});

// ----------------------
// CLIQUE NO ÍCONE
// ----------------------
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab || !tab.id || !tab.url) {
      console.warn('[Blink] ação clicada mas aba inválida', tab);
      return;
    }

    if (!canInjectInTab(tab)) {
      console.warn('[Blink] tentativa de injeção em URL não permitida:', tab.url);
      chrome.tabs.create({ url: 'https://www.google.com', active: true }, async (newTab) => {
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

    const alreadyInjected = await isExtensionInjected(tab.id);

    if (alreadyInjected) {
      console.log('[Blink] Extensão já injetada, removendo...');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const root = document.getElementById('blink-extension-root');
          if (root) root.remove();
        }
      });
      await removeTabFromActive(tab.id);
    } else {
      await injectExtension(tab.id);
    }
  } catch (err) {
    console.error('[Blink] script injection failed:', err);
  }
});

// ----------------------
// MENSAGENS
// ----------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  if (!msg || !msg.type) return false;

  console.log('[Background] Mensagem recebida:', msg.type, msg);

  // save-state
  if (msg.type === 'save-state') {
    (async () => {
      try {
        await saveState(msg.state);
        
        // ✅ CRÍTICO: Se setupCompleted=true, marcar globalmente
        if (msg.state && msg.state.setupCompleted === true) {
          await markSetupCompleted();
          console.log('[Background] ✅ Setup marcado como completo via save-state');
        }
        
        sendResp({ ok: true });
      } catch (err) {
        console.error('[Background] save-state error', err);
        sendResp({ ok: false, error: err?.message });
      }
    })();
    return true;
  }

  // load-state
  if (msg.type === 'load-state') {
    (async () => {
      try {
        const state = await loadState();
        const setupCompleted = await isSetupCompleted();
        
        // ✅ Garante que setupCompleted sempre está no estado
        const finalState = state || {};
        finalState.setupCompleted = setupCompleted;
        
        console.log('[Background] 📦 Estado carregado:', finalState);
        sendResp({ ok: true, state: finalState });
      } catch (err) {
        console.error('[Background] load-state error', err);
        sendResp({ ok: false, error: err?.message });
      }
    })();
    return true;
  }

  // ✅ NOVO: check-setup-status
  if (msg.type === 'check-setup-status') {
    (async () => {
      try {
        const setupCompleted = await isSetupCompleted();
        sendResp({ ok: true, setupCompleted });
      } catch (err) {
        sendResp({ ok: false, error: err?.message });
      }
    })();
    return true;
  }

  // extension-opened
  if (msg.type === 'extension-opened') {
    const tabId = sender.tab?.id;
    if (tabId) {
      markTabActive(tabId)
        .then(() => sendResp({ ok: true }))
        .catch(() => sendResp({ ok: false }));
      return true;
    }
    sendResp({ ok: false, error: 'no-tab' });
    return false;
  }

  // remove-overlay
  if (msg.type === 'remove-overlay') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const root = document.getElementById('blink-extension-root');
          if (root) root.remove();
        }
      })
        .then(() => removeTabFromActive(tabId))
        .then(() => sendResp({ ok: true }))
        .catch(() => sendResp({ ok: false }));
      return true;
    }
    sendResp({ ok: false });
    return false;
  }

  // set-camera-pref
  if (msg.type === 'set-camera-pref') {
    (async () => {
      const { tabId: explicitTabId, enabled } = msg;
      const tId = explicitTabId || sender.tab?.id;
      if (!tId) {
        sendResp({ ok: false, error: 'no-tab-id' });
        return;
      }
      try {
        await saveCameraPreferenceForTab(tId, !!enabled);
        
        // ✅ Só envia start-camera se setup completo
        if (enabled) {
          const setupDone = await isSetupCompleted();
          if (setupDone) {
            console.log('[Background] 📸 Enviando start-camera (pref habilitada + setup completo)');
            setTimeout(() => {
              sendCommandToIframe(tId, { 
                type: 'blink:command', 
                command: 'start-camera' 
              });
            }, 400);
          } else {
            console.log('[Background] ⏸️ Setup não completo, não enviando start-camera');
          }
        }
        
        sendResp({ ok: true });
      } catch (err) {
        console.error('[Background] set-camera-pref error', err);
        sendResp({ ok: false, error: err?.message });
      }
    })();
    return true;
  }

  // open-new-tab
  if (msg.type === 'open-new-tab') {
    chrome.tabs.create({
      url: msg.url || 'https://www.google.com',
      active: true
    }).then(tab => {
      console.log('[Background] Nova aba criada:', tab.id);
      
      const listener = (tabId, info) => {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          injectExtension(tab.id)
            .then(() => sendResp({ ok: true, tabId: tab.id }))
            .catch(err => sendResp({ ok: false, error: err?.message }));
        }
      };
      
      chrome.tabs.onUpdated.addListener(listener);
    }).catch(err => {
      console.error('[Background] Erro ao criar aba:', err);
      sendResp({ ok: false, error: err?.message });
    });
    return true;
  }

  // tab-previous / tab-next
  if (msg.type === 'tab-previous' || msg.type === 'tab-next') {
    (async () => {
      try {
        const tabs = await new Promise(r => 
          chrome.tabs.query({ currentWindow: true }, r)
        );
        
        if (tabs.length <= 1) {
          sendResp({ ok: false, message: 'Apenas uma aba aberta' });
          return;
        }

        const activeTabs = await new Promise(r => 
          chrome.tabs.query({ active: true, currentWindow: true }, r)
        );
        
        const currentTab = activeTabs[0];
        const currentIndex = tabs.findIndex(t => t.id === currentTab.id);
        
        let targetIndex;
        if (msg.type === 'tab-previous') {
          targetIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        } else {
          targetIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        }
        
        const targetTab = tabs[targetIndex];

        if (!canInjectInTab(targetTab)) {
          sendResp({ 
            ok: false, 
            message: 'Extensão não pode ser executada nesta página' 
          });
          return;
        }

        await new Promise(r => 
          chrome.tabs.update(targetTab.id, { active: true }, r)
        );

        if (targetTab.status !== 'complete') {
          await new Promise(resolve => {
            const listener = (tabId, info) => {
              if (tabId === targetTab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
          });
        }

        const injected = await isExtensionInjected(targetTab.id);
        if (!injected) await injectExtension(targetTab.id);
        
        sendResp({ ok: true, tabId: targetTab.id });
      } catch (err) {
        console.error('[Background] tab navigation error', err);
        sendResp({ ok: false, error: err?.message });
      }
    })();
    return true;
  }

  // close-current-tab
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

  return false;
});