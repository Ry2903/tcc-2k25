/* ---------------- CONFIG / ESTADO ---------------- */
const teclas = [
  'A', 'B', 'C', 'D', { type: 'action', action: 'backspace', icon: 'backspace' },
  { type: 'compound', items: ['caps', { type: 'action', action: 'openTabs', icon: 'gear' }] },
  'E', 'F', 'G', 'H', '?', { type: 'compound', items: ['enter', { type: 'action', action: 'clearAll', icon: 'trash' }] },
  'I', 'J', 'K', 'L', 'M', 'N',
  'O', 'P', 'QU', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'Y', 'Z'
];

let capsAtivo = false;
let botoesTeclado = [];
let botoesToolbar = [];
let botoesControls = [];
let botoesFieldSelector = [];
let activeMode = 'keyboard';

const numColunas = 6;
let rowInterval = 1200;
let firstRowDelay = rowInterval + 600;
let controlsRowInterval = rowInterval + 900;
let controlsFirstRowDelay = firstRowDelay + 600;
const COL_ROUNDS_MAX = 3;

/* ---------------- TIMERS / ESTADO RUNTIME ---------------- */
let rowIntervalId = null;
let colIntervalId = null;
let initialTimeoutId = null;
let toolbarRowIntervalId = null;
let toolbarInitialTimeoutId = null;
let toolbarIndex = 0;
let controlsRowIntervalId = null;
let controlsColIntervalId = null;
let controlsInitialTimeoutId = null;
let fieldSelectorIntervalId = null;
let fieldSelectorInitialTimeoutId = null;
let fieldSelectorIndex = 0;
let currentRow = 0;
let currentCol = 0;
let currentSub = 0;
let colRounds = 0;
let selectingColumn = false;
let controlsRowIndex = 0;
let controlsColIndex = 0;

/* ---------------- DEBUG E REGISTRY ---------------- */
if (typeof window !== 'undefined' && window.__kb_debug === undefined) {
  window.__kb_debug = true;
}

if (typeof window !== 'undefined') {
  window.__kb_specials = window.__kb_specials || {};
  window.__kb_specials_aliases = window.__kb_specials_aliases || {};
}

/* ---------------- GERENCIAMENTO DE CAMPO ATIVO ---------------- */
let campoTextoAtivo = null;
let campoTextoMetadata = null;
let camposDisponiveis = []; // Cache de campos detectados

function getCampoTextoAtivo() {
  // Se temos campo interno (dentro do iframe)
  if (campoTextoAtivo && document.body.contains(campoTextoAtivo)) {
    return campoTextoAtivo;
  }

  // Se temos metadata de campo externo
  if (campoTextoMetadata) {
    return {
      isExternal: true,
      metadata: campoTextoMetadata,
      value: campoTextoMetadata.valuePreview || '',
      setValue: (text) => {
        enviarTextoParaCampoExterno(text);
      }
    };
  }

  // Fallback para output interno
  return document.getElementById('output');
}

function setCampoTextoAtivo(elemento) {
  // Limpa campo anterior visualmente
  if (campoTextoAtivo && campoTextoAtivo.classList) {
    campoTextoAtivo.classList.remove('kb-campo-ativo');
  }

  // Se é metadado (campo externo vindos do content script)
  if (typeof elemento === 'object' && elemento.index !== undefined) {
    campoTextoMetadata = elemento;
    campoTextoAtivo = null;

    // grava índice para debug/persistência (útil para testes)
    try { window.__kb_lastExternalIndex = elemento.index; } catch (e) { }

    // Solicita foco no campo externo (content script lidará com isso)
    window.parent.postMessage({
      type: 'blink:focusInput',
      index: elemento.index
    }, '*');

    if (window.__kb_debug) {
      console.log('[KB] ✅ Campo externo ativado (metadata):', {
        index: elemento.index,
        tag: elemento.tag,
        placeholder: elemento.placeholder,
        valuePreview: elemento.valuePreview
      });
    }
    return;
  }

  // Caso DOM local (iframe)
  campoTextoMetadata = null;
  campoTextoAtivo = elemento;

  if (campoTextoAtivo) {
    // marca visual e tenta focar
    if (campoTextoAtivo.classList) campoTextoAtivo.classList.add('kb-campo-ativo');
    try { campoTextoAtivo.focus(); } catch (e) { /* ignore */ }
  }

  if (window.__kb_debug) {
    console.log('[KB] Campo ativo alterado (interno):', {
      id: elemento?.id, name: elemento?.name, placeholder: elemento?.placeholder
    });
  }
}

/* ---------------- COMUNICAÇÃO COM CAMPOS EXTERNOS ---------------- */
function enviarTextoParaCampoExterno(texto) {
  if (!campoTextoMetadata) {
    console.warn('[KB] Nenhum campo externo ativo');
    return;
  }

  window.parent.postMessage({
    type: 'blink:insertText',
    index: campoTextoMetadata.index,
    text: texto
  }, '*');

  if (window.__kb_debug) {
    console.log('[KB] 📤 Texto enviado para campo externo:', {
      index: campoTextoMetadata.index,
      text: texto
    });
  }
}

function enviarAcaoParaCampoExterno(acao) {
  if (!campoTextoMetadata) {
    console.warn('[KB] Nenhum campo externo ativo');
    return;
  }

  window.parent.postMessage({
    type: 'blink:insertAction',
    index: campoTextoMetadata.index,
    action: acao
  }, '*');

  if (window.__kb_debug) {
    console.log('[KB] 📤 Ação enviada:', acao);
  }
}

/* ---------------- DETECÇÃO DE CAMPOS (VERSÃO ROBUSTA) ---------------- */
function detectarCamposTexto() {
  // Se estamos dentro de um iframe (extensão), solicita ao content script
  if (window.parent !== window) {
    if (window.__kb_debug) {
      console.log('[KB] 🔍 Dentro de iframe - solicitando campos ao content script');
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[KB] ⏱️ Timeout ao aguardar resposta de campos');
        resolve(camposDisponiveis.length > 0 ? camposDisponiveis : []);
      }, 3000);

      const handleResponse = (event) => {
        if (event.data && event.data.type === 'blink:inputs') {
          clearTimeout(timeout);
          window.removeEventListener('message', handleResponse);

          camposDisponiveis = event.data.inputs || [];

          if (window.__kb_debug) {
            console.log('[KB] ✅ Campos recebidos:', camposDisponiveis.length);
            camposDisponiveis.forEach((c, i) => {
              console.log(`  [${i}] ${c.tag} - ${c.placeholder || c.name || 'sem nome'}`);
            });
          }

          resolve(camposDisponiveis);
        }
      };

      window.addEventListener('message', handleResponse);

      // Solicita campos ao content script
      window.parent.postMessage({ type: 'blink:requestInputs' }, '*');
    });
  }

  // Fallback: busca local (se não estiver em iframe)
  const seletores = [
    'input[type="text"]',
    'input[type="search"]',
    'input[type="email"]',
    'input[type="url"]',
    'input[type="tel"]',
    'input:not([type])',
    'textarea',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    '[role="textbox"]',
    '[role="searchbox"]',
    '[role="combobox"]'
  ];

  const campos = [];
  const visitados = new Set();

  const buscarEmDoc = (doc) => {
    try {
      const elements = doc.querySelectorAll(seletores.join(','));
      elements.forEach(campo => {
        if (visitados.has(campo)) return;
        visitados.add(campo);

        try {
          const rect = campo.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const style = doc.defaultView
              ? doc.defaultView.getComputedStyle(campo)
              : window.getComputedStyle(campo);

            if (style && style.display !== 'none' && style.visibility !== 'hidden') {
              if (!campo.hasAttribute('readonly') && !campo.disabled) {
                campos.push(campo);
              }
            }
          }
        } catch (e) { }
      });
    } catch (e) { }
  };

  buscarEmDoc(document);

  if (window.__kb_debug) {
    console.log('[KB] detectarCamposTexto (local) encontrou:', campos.length, 'campos');
  }

  return Promise.resolve(campos);
}

async function encontrarPrimeiroCampoTexto() {
  const campos = await detectarCamposTexto();

  if (campos.length === 0) {
    if (window.__kb_debug) console.warn('[KB] ⚠️ Nenhum campo de texto encontrado');
    return null;
  }

  // Se são metadados (do content script), retorna o primeiro
  if (typeof campos[0] === 'object' && campos[0].index !== undefined) {
    if (window.__kb_debug) console.log('[KB] 🎯 Campo prioritário (metadata):', campos[0].tag);
    return campos[0];
  }

  // Se são elementos DOM reais, aplica prioridades
  const prioridades = [
    c => c.tagName === 'TEXTAREA',
    c => c.getAttribute('contenteditable') === 'true',
    c => c.getAttribute('role') === 'searchbox',
    c => c.tagName === 'INPUT' && c.type === 'search',
    c => c.tagName === 'INPUT' && c.type === 'text',
    c => c.tagName === 'INPUT' && !c.type,
  ];

  for (const verificador of prioridades) {
    const encontrado = campos.find(verificador);
    if (encontrado) {
      if (window.__kb_debug) console.log('[KB] Campo prioritário encontrado:', encontrado.tagName);
      return encontrado;
    }
  }

  if (window.__kb_debug) console.log('[KB] Usando fallback - primeiro campo');
  return campos[0];
}

async function acionarTarget() {
  if (window.__kb_debug) console.log('[KB] ========== 🎯 ACIONANDO TARGET ==========');

  const campos = await detectarCamposTexto();
  if (window.__kb_debug) console.log('[KB] Campos encontrados:', campos.length);

  const campo = await encontrarPrimeiroCampoTexto();

  if (campo) {
    if (window.__kb_debug) {
      const label = typeof campo === 'object' && campo.tag
        ? campo.tag
        : (campo.tagName || 'unknown');
      console.log('[KB] ✅ Campo encontrado:', label);
    }

    setCampoTextoAtivo(campo);
    setActivePanel('keyboard');
    resetSelection();
  } else {
    console.warn('[KB] ❌ Nenhum campo encontrado - mostrando seletor');
    setActivePanel('field-selector');
    resetSelection();
  }

  if (window.__kb_debug) console.log('[KB] ========== TARGET FINALIZADO ==========');
}

/* ============ FIELD SELECTOR ============ */
async function criarPainelSelecaoCampo() {
  const panelRoot = document.getElementById('keyboard-panel');
  if (!panelRoot) return;

  let painel = document.getElementById('field-selector');
  if (painel) painel.remove();

  painel = document.createElement('div');
  painel.id = 'field-selector';
  painel.className = 'hidden';

  const titulo = document.createElement('h3');
  titulo.className = 'field-selector-title';
  titulo.textContent = 'Selecionar Campo de Texto';
  painel.appendChild(titulo);

  const lista = document.createElement('div');
  lista.className = 'campo-lista';

  const campos = await detectarCamposTexto();
  botoesFieldSelector = [];

  if (campos.length === 0) {
    const aviso = document.createElement('p');
    aviso.className = 'campo-aviso';
    aviso.textContent = 'Nenhum campo de texto encontrado na página.';
    lista.appendChild(aviso);
  } else {
    campos.forEach((campo, index) => {
      const btn = document.createElement('button');
      btn.className = 'campo-btn';
      btn.dataset.campoIndex = index;

      let label, info;
      if (typeof campo === 'object' && campo.tag) {
        label = campo.placeholder || campo.name || `Campo ${index + 1}`;
        info = `${campo.tag}${campo.type ? `[${campo.type}]` : ''}`;
        btn._campoMetadata = campo;
      } else {
        label = campo.placeholder || campo.name || campo.id || `Campo ${index + 1}`;
        info = `${campo.tagName.toLowerCase()}${campo.id ? '#' + campo.id : ''}`;
        btn._campo = campo;
      }

      const btnLabel = document.createElement('div');
      btnLabel.className = 'campo-btn-label';
      btnLabel.textContent = label;

      const btnInfo = document.createElement('div');
      btnInfo.className = 'campo-btn-info';
      btnInfo.textContent = info;

      btn.appendChild(btnLabel);
      btn.appendChild(btnInfo);

      btn.addEventListener('click', () => {
        if (btn._campoMetadata) {
          setCampoTextoAtivo(btn._campoMetadata);
        } else if (btn._campo) {
          setCampoTextoAtivo(btn._campo);
        }

        setActivePanel('keyboard');
        resetSelection();
      });

      botoesFieldSelector.push(btn);
      lista.appendChild(btn);
    });
  }

  painel.appendChild(lista);

  const footer = document.createElement('div');
  footer.className = 'field-selector-footer';

  const btnGear = document.createElement('button');
  btnGear.id = 'field-selector-gear';
  btnGear.className = 'icon-btn';
  btnGear.innerHTML = getIconHTML('gear');
  btnGear.addEventListener('click', () => {
    setActivePanel('toolbar');
    resetSelection();
  });
  footer.appendChild(btnGear);

  painel.appendChild(footer);
  panelRoot.appendChild(painel);

  if (window.__kb_debug) {
    console.log('[KB] Painel de seleção criado com', campos.length, 'campos');
  }
}

function mostrarPainelSelecaoCampo() {
  criarPainelSelecaoCampo().then(() => {
    const painel = document.getElementById('field-selector');
    const kbEl = document.getElementById('keyboard');
    const controlsEl = document.getElementById('controls');

    [kbEl, controlsEl].forEach(el => {
      if (el) {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    });

    if (painel) {
      painel.classList.remove('hidden');
      painel.setAttribute('aria-hidden', 'false');
    }

    activeMode = 'field-selector';
    startFieldSelectorCycle(true);
  });
}

function stopFieldSelectorTimers() {
  if (fieldSelectorIntervalId) {
    clearInterval(fieldSelectorIntervalId);
    fieldSelectorIntervalId = null;
  }
  if (fieldSelectorInitialTimeoutId) {
    clearTimeout(fieldSelectorInitialTimeoutId);
    fieldSelectorInitialTimeoutId = null;
  }
  botoesFieldSelector.forEach(b => b.classList.remove('selected', 'row-selected'));
}

function startFieldSelectorCycle(withFirstDelay = true) {
  stopFieldSelectorTimers();
  fieldSelectorIndex = 0;

  if (!botoesFieldSelector || !botoesFieldSelector.length) return;

  function doRow() {
    botoesFieldSelector.forEach(b => b.classList.remove('row-selected'));
    const idx = fieldSelectorIndex % botoesFieldSelector.length;
    botoesFieldSelector[idx].classList.add('row-selected');
    fieldSelectorIndex = (fieldSelectorIndex + 1) % botoesFieldSelector.length;
  }

  if (withFirstDelay) {
    doRow();
    fieldSelectorInitialTimeoutId = setTimeout(() => {
      doRow();
      fieldSelectorInitialTimeoutId = null;
      fieldSelectorIntervalId = setInterval(doRow, rowInterval);
    }, firstRowDelay);
  } else {
    fieldSelectorIntervalId = setInterval(doRow, rowInterval);
    doRow();
  }
}

/* ============ TAB MANAGEMENT ============ */
function sendMessageToBackground(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[KB] Erro ao enviar mensagem:', chrome.runtime.lastError);
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { ok: false });
        }
      });
    } catch (e) {
      console.error('[KB] Exceção ao enviar mensagem:', e);
      resolve({ ok: false, error: e.message });
    }
  });
}

async function abrirNovaAba() {
  console.log('[KB] Abrindo nova aba...');
  const response = await sendMessageToBackground({
    type: 'open-new-tab',
    url: 'https://www.google.com'
  });
  if (response.ok) console.log('[KB] ✅ Nova aba criada');
  else console.error('[KB] ❌ Erro ao criar aba:', response.error);
}

async function irParaAbaAnterior() {
  console.log('[KB] Indo para aba anterior...');
  const response = await sendMessageToBackground({ type: 'tab-previous' });
  if (response.ok) console.log('[KB] ✅ Mudou para aba anterior');
  else console.log('[KB] ℹ️', response.message || 'Não foi possível mudar de aba');
}

async function irParaProximaAba() {
  console.log('[KB] Indo para próxima aba...');
  const response = await sendMessageToBackground({ type: 'tab-next' });
  if (response.ok) console.log('[KB] ✅ Mudou para próxima aba');
  else console.log('[KB] ℹ️', response.message || 'Não foi possível mudar de aba');
}

async function fecharAbaAtual() {
  console.log('[KB] Fechando aba atual...');
  const response = await sendMessageToBackground({ type: 'close-current-tab' });
  if (response.ok) console.log('[KB] ✅ Aba fechada');
  else console.log('[KB] ℹ️', response.message || 'Não foi possível fechar aba');
}

/* ============ ICON HELPERS ============ */
const iconsCache = {};
const PRESERVE_STYLES = new Set(['backspace', 'trash']);
const ICONS_BASE = (function () {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      return chrome.runtime.getURL('icons/');
    }
  } catch (e) { }
  return '../icons/';
})();

function wrapIconHTML(svgInner, name, preserve = false) {
  const cls = preserve ? 'btn-icon preserve' : 'btn-icon';
  if (name === 'spacebar') return `<span class="${cls} space-icon" aria-hidden="true">${svgInner}</span>`;
  return `<span class="${cls}" aria-hidden="true">${svgInner}</span>`;
}

function iconSVGFallback(name) {
  if (name === 'gear') return wrapIconHTML(`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 10v6M4.2 4.2l4.3 4.3m7 7l4.3 4.3M1 12h6m10 0h6M4.2 19.8l4.3-4.3m7-7l4.3-4.3"/></svg>`, name);
  if (name === 'trash') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>`, name, true);
  if (name === 'backspace') return wrapIconHTML(`<svg viewBox="0 0 16 16"><path d="M15.683 3a2 2 0 0 0-2-2h-7.08a2 2 0 0 0-1.519.698L.241 7.35a1 1 0 0 0 0 1.302l4.843 5.65A2 2 0 0 0 6.603 15h7.08a2 2 0 0 0 2-2zM5.829 5.854a.5.5 0 1 1 .707-.708l2.147 2.147 2.146-2.147a.5.5 0 1 1 .707.708L9.39 8l2.146 2.146a.5.5 0 0 1-.707.708L8.683 8.707l-2.147 2.147a.5.5 0 0 1-.707-.708L7.976 8z"/></svg>`, name, true);
  if (name === 'spacebar') return wrapIconHTML(`<svg viewBox="0 0 24 24"><rect x="2" y="8" width="20" height="8" rx="2"/></svg>`, name);
  if (name === 'enter') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M5 12h10l-4-4 1.4-1.4L19 12l-6.6 6.4L10 17l4-4H5z"/></svg>`, name);
  if (name === 'tools') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`, name);
  if (name === 'plus') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14"/></svg>`, name);
  if (name === 'forward_tab') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M5 12h14m-7-7l7 7-7 7"/></svg>`, name);
  if (name === 'forward_tab_rev') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M19 12H5m7 7l-7-7 7-7"/></svg>`, name);
  if (name === 'x') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>`, name);
  if (name === 'target') return wrapIconHTML(`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`, name);
  if (name === '123' || name === 'abc') return wrapIconHTML(`<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/></svg>`, name);
  return `<span class="btn-icon" aria-hidden="true"></span>`;
}

async function preloadIcon(name) {
  if (!name || iconsCache[name]) return;
  try {
    const resp = await fetch(ICONS_BASE + name + '.svg');
    if (!resp.ok) throw new Error('SVG not found');
    let svg = await resp.text();
    svg = svg.replace(/<\?xml[\s\S]*?\?>/i, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s(width|height)="[^"]*"/gi, '');
    svg = svg.replace(/<svg([^>]*)>/i, (m, attrs) => {
      if (/preserveAspectRatio=/i.test(attrs)) return `<svg${attrs} width="100%" height="100%">`;
      return `<svg${attrs} preserveAspectRatio="xMidYMid meet" width="100%" height="100%">`;
    });
    if (PRESERVE_STYLES.has(name)) {
      iconsCache[name] = wrapIconHTML(svg, name, true);
      return;
    }
    svg = svg.replace(/(fill|stroke)=['"]([^'"]*)['"]/gi, (m, a, v) => {
      if (/currentColor/i.test(v) || /none/i.test(v)) return `${a}="${v}"`;
      return `${a}="currentColor"`;
    });
    iconsCache[name] = wrapIconHTML(svg, name, false);
  } catch (err) {
    iconsCache[name] = iconSVGFallback(name);
  }
}

function getIconHTML(name) {
  if (!name) return `<span class="btn-icon" aria-hidden="true"></span>`;
  if (iconsCache[name]) return iconsCache[name];
  const fb = iconSVGFallback(name);
  iconsCache[name] = fb;
  preloadIcon(name).catch(() => { });
  return fb;
}

/* ============ HELPERS ============ */
function normalizeEntry(entry) {
  if (!entry) return { node: null, occ: 0, meta: null };
  if (entry.el) return { node: entry.el, occ: (typeof entry.occ === 'number') ? entry.occ : 0, meta: entry };
  if (entry instanceof Element) return { node: entry, occ: 0, meta: null };
  return { node: null, occ: 0, meta: null };
}

function isElementNode(node) { return node && typeof node === 'object' && node.nodeType === 1; }
function addClassToElement(el, cls) { if (!isElementNode(el)) return; if (!el.classList.contains(cls)) el.classList.add(cls); }
function removeClassFromElement(el, cls) { if (!isElementNode(el)) return; if (el.classList.contains(cls)) el.classList.remove(cls); }

/* ============ CONTROLS ============ */
function garantirControls() {
  let controls = document.getElementById('controls');

  if (!controls) {
    const panelRoot = document.getElementById('keyboard-panel');
    if (!panelRoot) {
      console.error('[KB] CRÍTICO: #keyboard-panel não encontrado!');
      return null;
    }

    controls = document.createElement('div');
    controls.id = 'controls';
    controls.className = 'hidden';

    const grid = document.createElement('div');
    grid.className = 'config-grid';
    controls.appendChild(grid);

    panelRoot.appendChild(controls);

    if (window.__kb_debug) console.log('[KB] ✅ #controls criado');
  }

  return controls;
}

function ensureControlsBaseGroups() {
  const controls = garantirControls();
  if (!controls) return;
  const grid = controls.querySelector('.config-grid');
  if (!grid) return;
  if (document.getElementById('threshold-val')) return;

  function mkGroup(labelText, children) {
    const group = document.createElement('div');
    group.className = 'config-group';
    const label = document.createElement('label');
    label.textContent = labelText || '\u00A0';
    group.appendChild(label);
    const wrap = document.createElement('div');
    wrap.className = 'config-buttons';
    children.forEach(c => wrap.appendChild(c));
    group.appendChild(wrap);
    grid.appendChild(group);
    return { group, wrap };
  }

  function mkBtn(id, text) {
    const b = document.createElement('button');
    if (id) b.id = id;
    b.className = 'icon-btn';
    b.textContent = text;
    return b;
  }

  const thrDec = mkBtn('thr-dec', '<');
  const thrSpan = document.createElement('span');
  thrSpan.id = 'threshold-val';
  thrSpan.textContent = (typeof window.EAR_THRESHOLD !== 'undefined') ? String(window.EAR_THRESHOLD) : '0.279';
  const thrInc = mkBtn('thr-inc', '>');
  mkGroup('Threshold', [thrDec, thrSpan, thrInc]);

  const frmDec = mkBtn('frm-dec', '<');
  const frmSpan = document.createElement('span');
  frmSpan.id = 'frames-val';
  frmSpan.textContent = (typeof window.EAR_CONSEC_FRAMES !== 'undefined') ? String(window.EAR_CONSEC_FRAMES) : '1.5';
  const frmInc = mkBtn('frm-inc', '>');
  mkGroup('Frames consecutivos', [frmDec, frmSpan, frmInc]);

  const debDec = mkBtn('deb-dec', '<');
  const debSpan = document.createElement('span');
  debSpan.id = 'debounce-val';
  debSpan.textContent = (typeof window.DEBOUNCE_AFTER_BLINK !== 'undefined') ? String(window.DEBOUNCE_AFTER_BLINK) : '1.0';
  const debInc = mkBtn('deb-inc', '>');
  mkGroup('Debounce', [debDec, debSpan, debInc]);

  const rowDec = mkBtn('row-interval-dec', '<');
  const rowSpan = document.createElement('span');
  rowSpan.id = 'row-interval-val';
  rowSpan.textContent = `${rowInterval} ms`;
  const rowInc = mkBtn('row-interval-inc', '>');
  mkGroup('Intervalo entre linhas', [rowDec, rowSpan, rowInc]);

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'toggle-detection';
  toggleBtn.className = 'icon-btn';
  toggleBtn.textContent = 'Ativar/Desativar';
  mkGroup('\u00A0', [toggleBtn]);

  const gearBtn = document.createElement('button');
  gearBtn.id = 'settings-gear-btn';
  gearBtn.className = 'icon-btn';
  gearBtn.innerHTML = getIconHTML('gear');
  gearBtn.addEventListener('click', () => {
    setActivePanel('toolbar');
    resetSelection();
  });
  mkGroup('\u00A0', [gearBtn]);

  rowDec.addEventListener('click', () => {
    rowInterval = Math.max(200, rowInterval - 100);
    updateRowIntervalDisplay();
    resetSelection();
  });

  rowInc.addEventListener('click', () => {
    rowInterval = Math.min(5000, rowInterval + 100);
    updateRowIntervalDisplay();
    resetSelection();
  });

  if (window.__kb_debug) console.log('ensureControlsBaseGroups -> criados');
}

function buildControlsModel() {
  ensureControlsBaseGroups();
  botoesControls = [];
  const groups = Array.from(document.querySelectorAll('#controls .config-group'));
  groups.forEach(group => {
    const btnContainer = group.querySelector('.config-buttons');
    if (!btnContainer) return;
    const buttons = Array.from(btnContainer.querySelectorAll('button'));
    const type = (buttons.length >= 2) ? 'pair' : 'single';
    botoesControls.push({ el: btnContainer, buttons, groupEl: group, type });
  });

  const gearBtn = document.getElementById('settings-gear-btn');
  if (gearBtn) {
    const wrap = gearBtn.parentElement;
    const groupEl = wrap ? wrap.parentElement : null;
    if (!botoesControls.some(c => c.buttons.some(b => b && b.id === 'settings-gear-btn'))) {
      botoesControls.push({ el: wrap, buttons: [gearBtn], groupEl: groupEl, type: 'single' });
    }
  }

  if (window.__kb_debug) console.log('buildControlsModel ->', botoesControls);
}

function updateRowIntervalDisplay() {
  const span = document.getElementById('row-interval-val');
  if (span) span.textContent = `${rowInterval} ms`;
}

function clearControlsSelections() {
  botoesControls.forEach(entry => {
    try {
      if (entry.el) entry.el.classList.remove('row-selected', 'selected');
      if (Array.isArray(entry.buttons)) entry.buttons.forEach(b => {
        if (b && b.classList) b.classList.remove('row-selected', 'selected');
      });
      if (entry.groupEl) entry.groupEl.classList.remove('row-selected', 'selected');
    } catch (e) { }
  });
}

function getCurrentlySelectedControlButton() {
  for (let i = 0; i < botoesControls.length; i++) {
    const entry = botoesControls[i];
    if (!entry) continue;
    if (entry.buttons && entry.buttons.length) {
      for (let j = 0; j < entry.buttons.length; j++) {
        const b = entry.buttons[j];
        if (b && b.classList && b.classList.contains('selected')) return b;
      }
    }
    if (entry.el && entry.el.classList.contains('row-selected') && entry.buttons && entry.buttons.length === 1) {
      return entry.buttons[0];
    }
  }
  return undefined;
}

/* ============ FORMATTING / PROCESSING ============ */
const especiais = ['caps', '?', 'enter'];

function formatarLabel(item) {
  if (typeof item === 'string') {
    if (especiais.includes(item)) return item;
    return capsAtivo ? item.toUpperCase() : item.toLowerCase();
  }
  return null;
}

function processarTecla(item) {
  const out = getCampoTextoAtivo();
  const outIsExternal = !!(out && out.isExternal);

  if (typeof item === 'object' && item !== null && item.type === 'action') {
    switch (item.action) {
      case 'clearAll':
        if (outIsExternal) enviarAcaoParaCampoExterno('clearAll');
        else if (out) out.value = '';
        return;
      case 'openTabs':
        setActivePanel('toolbar');
        return;
      case 'backspace':
        if (outIsExternal) enviarAcaoParaCampoExterno('backspace');
        else if (out) out.value = out.value.slice(0, -1);
        return;
      default:
        document.dispatchEvent(new CustomEvent('keyboard:action', { detail: { action: item.action, raw: item } }));
        return;
    }
  }

  if (item === 'caps') {
    capsAtivo = !capsAtivo;
    criarTeclado();
    return;
  }

  if (item === 'enter') {
    if (outIsExternal) enviarAcaoParaCampoExterno('enter');
    else document.dispatchEvent(new CustomEvent('keyboard:enter', { detail: { value: out ? out.value : undefined } }));
    return;
  }

  if (item === 'space') {
    if (outIsExternal) enviarTextoParaCampoExterno(' ');
    else if (out) out.value += ' ';
    return;
  }

  if (typeof item === 'object' && item !== null && item.type === 'special') {
    if (item.char === 'enter') {
      if (outIsExternal) enviarAcaoParaCampoExterno('enter');
      else document.dispatchEvent(new CustomEvent('keyboard:enter', { detail: { value: out ? out.value : undefined } }));
      return;
    }
  }

  if (typeof item === 'string') {
    const ch = formatarLabel(item);
    if (outIsExternal) {
      enviarTextoParaCampoExterno(ch);
    } else if (out) {
      // tenta focar e inserir no elemento DOM local (iframe)
      try { if (typeof out.focus === 'function') out.focus(); } catch (e) { }
      if (out && typeof out.setRangeText === 'function') {
        // usa setRangeText quando disponível (textarea/input)
        try {
          out.setRangeText(ch, out.selectionStart || out.value.length, out.selectionEnd || out.value.length, 'end');
        } catch (e) { out.value += ch; }
      } else {
        out.value += ch;
      }
    } else {
      document.dispatchEvent(new CustomEvent('keyboard:char', { detail: { char: ch } }));
    }
    return;
  }

  if (window.__kb_debug) console.warn('processarTecla: item não reconhecido', item);
}


/* ============ CRIAR KEYBOARD ============ */
function getKeyboardContainer() {
  let kb = document.getElementById('keyboard');
  if (kb) return kb;
  const panelRoot = document.getElementById('keyboard-panel');
  if (!panelRoot) return null;
  kb = document.createElement('div');
  kb.id = 'keyboard';
  kb.className = 'grid-6cols';
  panelRoot.appendChild(kb);
  return kb;
}

function criarTeclado() {
  window.__kb_specials = window.__kb_specials || {};
  window.__kb_specials_aliases = window.__kb_specials_aliases || {};

  const container = getKeyboardContainer();
  if (!container) return;

  // ✅ LIMPA COMPLETAMENTE antes de recriar
  container.innerHTML = '';
  botoesTeclado = [];

  container.className = 'grid-6cols';
  container.setAttribute('data-mode', 'keyboard');

  teclas.forEach((item, index) => {
    if (typeof item === 'object' && item.type === 'compound') {
      const wrapper = document.createElement('div');
      wrapper.className = 'compound-cell';
      const halves = [];

      item.items.forEach((sub, subIndex) => {
        const half = document.createElement('button');
        half.className = 'half-btn';
        const idKey = (typeof sub === 'object' && (sub.icon || sub.action)) ? (sub.icon || sub.action) : `kw-${index}-${subIndex}`;
        half.id = `key-half-${idKey}-${index}-${subIndex}`;

        if (typeof sub === 'object' && sub.type === 'action') {
          half.classList.add('action-btn', 'icon-btn', 'key-special');
          if (sub.icon) half.dataset.icon = sub.icon;
          if (sub.action) half.dataset.action = sub.action;
          half.innerHTML = getIconHTML(sub.icon || '');

          // ✅ USA ONCLICK AO INVÉS DE ADDEVENTLISTENER
          half.onclick = () => {
            if (activeMode !== 'keyboard') return;
            processarTecla(sub);
            resetSelection();
          };

          window.__kb_specials[half.id] = half;
          const aliasId = `key-action-${sub.icon || sub.action || idKey}`;
          window.__kb_specials_aliases[aliasId] = half;
          half.setAttribute('data-alias-id', aliasId);
        } else {
          if (sub === 'enter') {
            half.classList.add('key-special', 'icon-btn');
            half.dataset.value = 'enter';                     // <-- ADICIONADO
            half.innerHTML = getIconHTML('enter');
            half.addEventListener('click', () => { if (activeMode !== 'keyboard') return; processarTecla('enter'); resetSelection(); });
            window.__kb_specials[half.id] = half;
            half.setAttribute('data-alias-id', `key-action-enter-${index}-${subIndex}`);
          } else if (sub === 'caps') {
            half.classList.add('key-special', 'icon-btn');
            half.textContent = formatarLabel('caps');
            half.dataset.value = 'caps';
            half.onclick = () => {
              if (activeMode !== 'keyboard') return;
              processarTecla('caps');
              resetSelection();
            };
            window.__kb_specials[half.id] = half;
            half.setAttribute('data-alias-id', `key-action-caps-${index}-${subIndex}`);
          } else {
            half.textContent = formatarLabel(sub);
            if (especiais.includes(sub)) half.classList.add('key-special');
            half.dataset.value = (typeof sub === 'string') ? sub : '';
            half.onclick = () => {
              if (activeMode !== 'keyboard') return;
              processarTecla(sub);
              resetSelection();
            };
          }
        }

        wrapper.appendChild(half);
        halves.push(half);
      });

      container.appendChild(wrapper);
      botoesTeclado.push({ el: wrapper, type: 'compound', items: item.items, halves, occ: 0, index });
      return;
    }

    const btn = document.createElement('button');

    if (typeof item === 'object' && item.type === 'action') {
      const idKey = item.icon || item.action || `action-${index}`;
      btn.id = `key-action-${idKey}-${index}`;
      btn.className = 'icon-btn key-special action-btn';
      if (item.icon) btn.dataset.icon = item.icon;
      if (item.action) btn.dataset.action = item.action;
      btn.innerHTML = getIconHTML(item.icon || '');

      // ✅ USA ONCLICK
      btn.onclick = () => {
        if (activeMode !== 'keyboard') return;
        processarTecla(item);
        resetSelection();
      };

      container.appendChild(btn);
      botoesTeclado.push({ el: btn, type: 'action', value: item, icon: item.icon || null, action: item.action || null, index });
      window.__kb_specials[btn.id] = btn;
      const aliasId = `key-action-${item.icon || item.action || idKey}`;
      window.__kb_specials_aliases[aliasId] = btn;
      btn.setAttribute('data-alias-id', aliasId);
    } else {
      if (item === 'enter') {
        btn.innerHTML = getIconHTML('enter');
        btn.id = `key-special-enter-${index}`;
        btn.classList.add('key-special', 'icon-btn');
        btn.dataset.value = 'enter';                      // <-- ADICIONADO
        btn.addEventListener('click', () => { if (activeMode !== 'keyboard') return; processarTecla('enter'); resetSelection(); });
        container.appendChild(btn);
        botoesTeclado.push({ el: btn, type: 'special', value: 'enter', index });
        window.__kb_specials[btn.id] = btn;
        const aliasId = `key-action-enter-${index}`;
        window.__kb_specials_aliases[aliasId] = btn;
        btn.setAttribute('data-alias-id', aliasId);
      } else {
        btn.textContent = formatarLabel(item);
        btn.dataset.value = (typeof item === 'string') ? item : '';
        if (especiais.includes(item)) btn.classList.add('key-special');
        btn.onclick = () => {
          if (activeMode !== 'keyboard') return;
          processarTecla(item);
          resetSelection();
        };
        container.appendChild(btn);
        botoesTeclado.push({ el: btn, type: 'simple', value: item, index });
      }
    }
  });

  const spaceRow = document.createElement('button');
  spaceRow.className = 'space-row';
  spaceRow.id = 'key-space';
  spaceRow.dataset.value = 'space';
  spaceRow._item = 'space';
  spaceRow.innerHTML = getIconHTML('spacebar');
  spaceRow.onclick = () => {
    if (activeMode !== 'keyboard') return;
    processarTecla('space');
    resetSelection();
  };
  container.appendChild(spaceRow);
  botoesTeclado.push({ el: spaceRow, type: 'space', value: 'space', index: botoesTeclado.length });
  window.__kb_specials[spaceRow.id] = spaceRow;
  window.__kb_specials_aliases[`key-action-space`] = spaceRow;
  spaceRow.setAttribute('data-alias-id', 'key-action-space');

  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if (node && node.classList) node.classList.remove('row-selected', 'selected');
    if (node && node.querySelectorAll) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('row-selected', 'selected'));
  });

  currentRow = 0;
  selectingColumn = false;
}

/* ============ CRIAR NUMPAD ============ */
function criarNumpad() {
  window.__kb_specials = window.__kb_specials || {};
  window.__kb_specials_aliases = window.__kb_specials_aliases || {};

  const container = getKeyboardContainer();
  if (!container) return;
  container.innerHTML = '';
  botoesTeclado = [];

  container.className = 'grid-6cols';
  container.setAttribute('data-mode', 'numpad');

  const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  for (let i = 0; i < 5; i++) {
    const b = document.createElement('button');
    b.className = 'num-btn';
    b.id = `num-${numbers[i]}`;
    b.textContent = numbers[i];
    b.dataset.value = numbers[i];
    b._item = numbers[i];
    b.addEventListener('click', () => { if (activeMode !== 'numpad') return; processarTecla(numbers[i]); resetSelection(); });
    container.appendChild(b);
    botoesTeclado.push({ el: b, type: 'num', value: numbers[i], index: botoesTeclado.length });
  }

  const specialWrapper1 = document.createElement('div');
  specialWrapper1.className = 'compound-cell special-wrapper-top';
  specialWrapper1.style.gridColumn = String(numColunas);
  specialWrapper1.style.gridRow = '1';
  specialWrapper1.dataset.rowSpan = '1';

  const specialDefs1 = [
    { type: 'action', action: 'openTabs', icon: 'gear' },
    { type: 'action', action: 'backspace', icon: 'backspace' }
  ];

  const halves1 = [];
  specialDefs1.forEach((sd, idx) => {
    const sb = document.createElement('button');
    sb.className = 'half-btn sp-btn key-special action-btn icon-btn';
    const idKey = sd.icon || sd.action || `sp-top-${idx}`;
    sb.id = `numpad-action-${idKey}-top`;
    if (sd.type === 'action') sb.dataset.action = sd.action || '';
    if (sd.icon) sb.dataset.icon = sd.icon;
    sb._numpadAction = sd;
    sb.innerHTML = getIconHTML(sd.icon || '');
    sb.addEventListener('click', () => { if (activeMode !== 'numpad') return; processarTecla(sd); resetSelection(); });
    specialWrapper1.appendChild(sb);
    halves1.push(sb);
    window.__kb_specials[sb.id] = sb;
    const aliasId = `numpad-action-${sd.icon || sd.action || idKey}`;
    window.__kb_specials_aliases[aliasId] = sb;
    sb.setAttribute('data-alias-id', aliasId);
  });

  container.appendChild(specialWrapper1);
  botoesTeclado.push({ el: specialWrapper1, type: 'special-wrapper', halves: halves1, occ: 0, index: botoesTeclado.length });

  for (let i = 5; i < 10; i++) {
    const b = document.createElement('button');
    b.className = 'num-btn';
    b.id = `num-${numbers[i]}`;
    b.textContent = numbers[i];
    b.dataset.value = numbers[i];
    b._item = numbers[i];
    b.addEventListener('click', () => { if (activeMode !== 'numpad') return; processarTecla(numbers[i]); resetSelection(); });
    container.appendChild(b);
    botoesTeclado.push({ el: b, type: 'num', value: numbers[i], index: botoesTeclado.length });
  }

  const specialWrapper2 = document.createElement('div');
  specialWrapper2.className = 'compound-cell special-wrapper-bottom';
  specialWrapper2.style.gridColumn = String(numColunas);
  specialWrapper2.style.gridRow = '2';
  specialWrapper2.dataset.rowSpan = '1';

  const specialDefs2 = [
    { type: 'special', char: 'enter', icon: 'enter' },
    { type: 'action', action: 'clearAll', icon: 'trash' }
  ];

  const halves2 = [];
  specialDefs2.forEach((sd, idx) => {
    const sb = document.createElement('button');
    sb.className = 'half-btn sp-btn key-special action-btn icon-btn';
    const idKey = sd.icon || sd.action || sd.char || `sp-bottom-${idx}`;
    sb.id = `numpad-action-${idKey}-bottom`;
    if (sd.type === 'action') sb.dataset.action = sd.action || '';
    if (sd.icon) sb.dataset.icon = sd.icon;
    if (sd.type === 'special' && sd.char) sb.dataset.value = sd.char;
    sb._numpadAction = sd;
    sb.innerHTML = getIconHTML(sd.icon || '');
    sb.addEventListener('click', () => {
      if (activeMode !== 'numpad') return;
      if (sd.type === 'action') processarTecla(sd);
      else if (sd.type === 'special' && sd.char === 'enter') processarTecla('enter');
      resetSelection();
    });
    specialWrapper2.appendChild(sb);
    halves2.push(sb);
    window.__kb_specials[sb.id] = sb;
    const aliasId = `numpad-action-${sd.icon || sd.action || sd.char || idKey}`;
    window.__kb_specials_aliases[aliasId] = sb;
    sb.setAttribute('data-alias-id', aliasId);
  });

  container.appendChild(specialWrapper2);
  botoesTeclado.push({ el: specialWrapper2, type: 'special-wrapper', halves: halves2, occ: 1, index: botoesTeclado.length });

  const spaceRow = document.createElement('button');
  spaceRow.className = 'space-row';
  spaceRow.id = 'numpad-space';
  spaceRow.dataset.value = 'space';
  spaceRow._item = 'space';
  spaceRow.innerHTML = getIconHTML('spacebar');
  spaceRow.addEventListener('click', () => { if (activeMode !== 'numpad') return; processarTecla('space'); resetSelection(); });
  container.appendChild(spaceRow);
  botoesTeclado.push({ el: spaceRow, type: 'space', value: 'space', index: botoesTeclado.length });
  window.__kb_specials[spaceRow.id] = spaceRow;
  window.__kb_specials_aliases[`numpad-action-space`] = spaceRow;
  spaceRow.setAttribute('data-alias-id', 'numpad-action-space');

  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if (node && node.classList) node.classList.remove('row-selected', 'selected');
    if (node && node.querySelectorAll) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('row-selected', 'selected'));
  });

  currentRow = 0;
  selectingColumn = false;
}

/* ============ CRIAR TOOLBAR ============ */
function criarToolbar() {
  const root = document.getElementById('keyboard-root') || document.getElementById('keyboard-panel');
  if (!root) return;

  const placeholder = document.getElementById('toolbar-placeholder') || root.querySelector('#toolbar-panel') || null;
  const parentForToolbar = placeholder || root;

  const existingGlobal = document.querySelector('.toolbar');
  if (existingGlobal && existingGlobal.parentNode && existingGlobal.parentNode !== parentForToolbar) {
    try { existingGlobal.parentNode.removeChild(existingGlobal); } catch (e) { }
  }

  const existing = parentForToolbar.querySelector('.toolbar');
  if (existing) {
    botoesToolbar = Array.from(existing.querySelectorAll('.tool-btn'));
    return;
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const group = document.createElement('div');
  group.className = 'tool-group';

  const buttons = [
    { id: 'tool-target', icon: 'target', action: 'target' },
    { id: 'tool-tools', icon: 'tools', action: 'tools' },
    { id: 'tool-plus', icon: 'plus', action: 'plus' },
    { id: 'tool-back', icon: 'forward_tab_rev', action: 'back' },
    { id: 'tool-fwd', icon: 'forward_tab', action: 'forward' },
    { id: 'tool-x', icon: 'x', action: 'x' },
    { id: 'tool-123', icon: '123', action: 'numpad' },
    { id: 'tool-abc', icon: 'abc', action: 'alpha' }
  ];

  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    if (b.id) btn.id = b.id;
    btn.innerHTML = getIconHTML(b.icon);
    btn.dataset.action = b.action;

    btn.addEventListener('click', () => {
      if (window.__kb_debug) console.log('[KB] Toolbar button clicked:', b.action);

      if (b.action === 'numpad') setActivePanel('numpad');
      else if (b.action === 'alpha') setActivePanel('keyboard');
      else if (b.action === 'tools') setActivePanel('controls');
      else if (b.action === 'target') mostrarPainelSelecaoCampo();
      else document.dispatchEvent(new CustomEvent('toolbar:action', { detail: { action: b.action } }));

      try { resetSelection(); } catch (e) { }
    });

    group.appendChild(btn);
  });

  toolbar.appendChild(group);

  const kb = document.getElementById('keyboard');
  try {
    if (placeholder) placeholder.appendChild(toolbar);
    else if (kb && kb.parentNode) kb.parentNode.insertBefore(toolbar, kb);
    else root.insertBefore(toolbar, root.firstChild);
  } catch (err) {
    try { root.appendChild(toolbar); } catch (e) {
      if (window.__kb_debug) console.error('criarToolbar insert failed', e);
    }
  }

  botoesToolbar = Array.from(toolbar.querySelectorAll('.tool-btn'));
  if (window.__kb_debug) console.log('[KB] Toolbar criada com', botoesToolbar.length, 'botões');
}

/* ============ STOP ALL TIMERS ============ */
function stopAllTimers() {
  if (rowIntervalId) { clearInterval(rowIntervalId); rowIntervalId = null; }
  if (colIntervalId) { clearInterval(colIntervalId); colIntervalId = null; }
  if (initialTimeoutId) { clearTimeout(initialTimeoutId); initialTimeoutId = null; }
  if (toolbarRowIntervalId) { clearInterval(toolbarRowIntervalId); toolbarRowIntervalId = null; }
  if (toolbarInitialTimeoutId) { clearTimeout(toolbarInitialTimeoutId); toolbarInitialTimeoutId = null; }
  if (controlsRowIntervalId) { clearInterval(controlsRowIntervalId); controlsRowIntervalId = null; }
  if (controlsColIntervalId) { clearInterval(controlsColIntervalId); controlsColIntervalId = null; }
  if (controlsInitialTimeoutId) { clearTimeout(controlsInitialTimeoutId); controlsInitialTimeoutId = null; }
  if (fieldSelectorIntervalId) { clearInterval(fieldSelectorIntervalId); fieldSelectorIntervalId = null; }
  if (fieldSelectorInitialTimeoutId) { clearTimeout(fieldSelectorInitialTimeoutId); fieldSelectorInitialTimeoutId = null; }
  selectingColumn = false;
  currentSub = 0;
  colRounds = 0;
}

/* ============ KEYBOARD ROW HIGHLIGHT ============ */
function highlightRowImmediate() {
  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if (node && node.classList) node.classList.remove('row-selected', 'selected');
    if (node && node.querySelectorAll) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('row-selected', 'selected'));
  });

  const totalRows = Math.max(1, Math.ceil(botoesTeclado.length / numColunas));
  const start = currentRow * numColunas;

  for (let i = start; i < start + numColunas && i < botoesTeclado.length; i++) {
    const entry = botoesTeclado[i];
    const { node, occ } = normalizeEntry(entry);
    if (!node) continue;

    if (node.classList && node.classList.contains('compound-cell')) {
      if (node.classList.contains('special-wrapper')) {
        const halves = Array.from(node.querySelectorAll('.half-btn'));
        const rowSpan = Math.max(1, parseInt(node.dataset.rowSpan || '1', 10));
        const halvesPerRow = Math.ceil(halves.length / rowSpan);
        const whichOcc = (typeof occ === 'number') ? occ : 0;
        const startHalf = whichOcc * halvesPerRow;
        for (let h = startHalf; h < startHalf + halvesPerRow && h < halves.length; h++) {
          halves[h].classList.add('row-selected');
        }
      } else {
        node.classList.add('row-selected');
        node.querySelectorAll('.half-btn').forEach(h => h.classList.add('row-selected'));
      }
    } else {
      node.classList.add('row-selected');
    }
  }

  currentRow = (currentRow + 1) % totalRows;
}

/* ============ KEYBOARD ROW CYCLE ============ */
function startRowCycle(withFirstDelay = true) {
  if (activeMode !== 'keyboard' && activeMode !== 'numpad') return;
  stopAllTimers();
  currentRow = 0;
  if (window.__kb_debug) console.log('[KB] startRowCycle -> withFirstDelay=', withFirstDelay);

  function doRow() { highlightRowImmediate(); }
  if (withFirstDelay) {
    doRow();
    initialTimeoutId = setTimeout(() => {
      doRow();
      initialTimeoutId = null;
      rowIntervalId = setInterval(doRow, rowInterval);
    }, firstRowDelay);
  } else {
    rowIntervalId = setInterval(doRow, rowInterval);
    doRow();
  }
}

/* ============ KEYBOARD COLUMN CYCLE ============ */
function startColumnCycle() {
  if (rowIntervalId) { clearInterval(rowIntervalId); rowIntervalId = null; }
  if (initialTimeoutId) { clearTimeout(initialTimeoutId); initialTimeoutId = null; }

  selectingColumn = true;
  colRounds = 0;
  currentCol = 0;
  currentSub = 0;

  const totalRows = Math.max(1, Math.ceil(botoesTeclado.length / numColunas));
  const lastRow = (currentRow - 1 + totalRows) % totalRows;
  const start = lastRow * numColunas;

  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if (!node) return;
    if (node.classList && node.classList.contains('compound-cell')) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected'));
    node.classList && node.classList.remove('selected');
  });

  function columnTick() {
    botoesTeclado.forEach(entry => {
      const { node } = normalizeEntry(entry);
      if (!node) return;
      if (node.classList && node.classList.contains('compound-cell')) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected'));
      else node.classList && node.classList.remove('selected');
    });

    const idx = start + currentCol;

    if (idx < botoesTeclado.length) {
      const entry = botoesTeclado[idx];
      const { node, meta } = normalizeEntry(entry);
      if (!node) {
        currentCol = (currentCol + 1) % numColunas;
        if (currentCol === 0) colRounds++;
      } else if (node.classList && node.classList.contains('compound-cell')) {
        const halves = (meta && meta.halves && Array.isArray(meta.halves)) ? meta.halves : Array.from(node.querySelectorAll('.half-btn'));

        if (halves && halves.length) {
          const target = halves[currentSub % halves.length];
          if (target) {
            removeClassFromElement(target, 'selected');
            addClassToElement(target, 'selected');
          }
          currentSub++;
          if (currentSub >= halves.length) {
            currentSub = 0;
            currentCol = (currentCol + 1) % numColunas;
            if (currentCol === 0) colRounds++;
          }
        } else {
          addClassToElement(node, 'selected');
          currentCol = (currentCol + 1) % numColunas;
          if (currentCol === 0) colRounds++;
        }
      } else {
        addClassToElement(node, 'selected');
        currentCol = (currentCol + 1) % numColunas;
        if (currentCol === 0) colRounds++;
      }
    } else {
      currentCol = (currentCol + 1) % numColunas;
      if (currentCol === 0) colRounds++;
    }

    if (colRounds >= COL_ROUNDS_MAX) {
      clearInterval(colIntervalId);
      colIntervalId = null;
      selectingColumn = false;

      botoesTeclado.forEach(entry => {
        const { node } = normalizeEntry(entry);
        if (!node) return;
        if (node.classList && node.classList.contains('compound-cell')) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected'));
        node.classList && node.classList.remove('selected');
      });

      startRowCycle(false);
    }
  }

  columnTick();
  colIntervalId = setInterval(columnTick, rowInterval);
}

/* ============ TOOLBAR CYCLE ============ */
function stopToolbarTimers() {
  if (toolbarRowIntervalId) { clearInterval(toolbarRowIntervalId); toolbarRowIntervalId = null; }
  if (toolbarInitialTimeoutId) { clearTimeout(toolbarInitialTimeoutId); toolbarInitialTimeoutId = null; }
  botoesToolbar.forEach(b => b.classList.remove('selected', 'row-selected'));
}

function startToolbarCycle(withFirstDelay = true) {
  stopToolbarTimers();
  toolbarIndex = 0;

  if (!botoesToolbar || !botoesToolbar.length) {
    const anyToolbar = document.querySelector('.toolbar');
    if (anyToolbar) botoesToolbar = Array.from(anyToolbar.querySelectorAll('.tool-btn'));
  }
  if (!botoesToolbar || !botoesToolbar.length) return;

  function doRow() {
    botoesToolbar.forEach(b => b.classList.remove('row-selected'));
    const idx = toolbarIndex % botoesToolbar.length;
    botoesToolbar[idx].classList.add('row-selected');
    toolbarIndex = (toolbarIndex + 1) % botoesToolbar.length;
  }

  if (withFirstDelay) {
    doRow();
    toolbarInitialTimeoutId = setTimeout(() => {
      doRow();
      toolbarInitialTimeoutId = null;
      toolbarRowIntervalId = setInterval(doRow, rowInterval);
    }, firstRowDelay);
  } else {
    toolbarRowIntervalId = setInterval(doRow, rowInterval);
    doRow();
  }
}

/* ============ CONTROLS CYCLE ============ */
function highlightControlsRowImmediate() {
  clearControlsSelections();
  if (!botoesControls || !botoesControls.length) return;
  const totalRows = botoesControls.length;
  const idx = controlsRowIndex % totalRows;
  const entry = botoesControls[idx];
  if (!entry) return;
  if (entry.el && entry.el.classList) entry.el.classList.add('row-selected');
  if (entry.groupEl && entry.groupEl.classList) entry.groupEl.classList.add('row-selected');
  controlsRowIndex = (controlsRowIndex + 1) % totalRows;
}

function startControlsRowCycle(withFirstDelay = true) {
  if (activeMode !== 'controls') return;
  stopAllTimers();
  buildControlsModel();
  controlsRowIndex = 0;

  function doRow() { highlightControlsRowImmediate(); }
  if (withFirstDelay) {
    doRow();
    controlsInitialTimeoutId = setTimeout(() => {
      doRow();
      controlsInitialTimeoutId = null;
      controlsRowIntervalId = setInterval(doRow, controlsRowInterval);
    }, controlsFirstRowDelay);
  } else {
    controlsRowIntervalId = setInterval(() => { highlightControlsRowImmediate(); }, controlsRowInterval);
    doRow();
  }
}

function startControlsColumnCycle() {
  if (controlsRowIntervalId) { clearInterval(controlsRowIntervalId); controlsRowIntervalId = null; }
  if (controlsInitialTimeoutId) { clearTimeout(controlsInitialTimeoutId); controlsInitialTimeoutId = null; }

  selectingColumn = true;
  controlsColIndex = 0;
  colRounds = 0;

  const total = Math.max(1, botoesControls.length);
  const lastRow = (controlsRowIndex - 1 + total) % total;
  const entry = botoesControls[lastRow];
  if (!entry) {
    selectingColumn = false;
    startControlsRowCycle(false);
    return;
  }

  clearControlsSelections();
  if (entry.el && entry.el.classList) entry.el.classList.add('row-selected');
  if (entry.groupEl && entry.groupEl.classList) entry.groupEl.classList.add('row-selected');

  function columnTick() {
    botoesControls.forEach(e => {
      if (e.buttons && e.buttons.length) e.buttons.forEach(b => b.classList.remove('selected'));
    });

    const buttons = entry.buttons || [];
    if (buttons.length === 0) {
      if (entry.el) entry.el.classList.add('selected');
      colRounds++;
    } else {
      const idx = controlsColIndex % buttons.length;
      const target = buttons[idx];
      if (target) target.classList.add('selected');
      controlsColIndex = (controlsColIndex + 1) % buttons.length;
      if (controlsColIndex === 0) colRounds++;
    }

    if (colRounds >= COL_ROUNDS_MAX) {
      if (controlsColIntervalId) { clearInterval(controlsColIntervalId); controlsColIntervalId = null; }
      selectingColumn = false;
      botoesControls.forEach(e => {
        if (e.buttons && e.buttons.length) e.buttons.forEach(b => b.classList.remove('selected'));
      });
      startControlsRowCycle(false);
    }
  }

  columnTick();
  controlsColIntervalId = setInterval(columnTick, controlsRowInterval);
}

/* ============ CONFIRMAÇÃO / SELEÇÃO ============ */
function selecionarTeclaAtual() {
  console.log('[BLINK] selecionarTeclaAtual called ->', { activeMode, selectingColumn });

  if (activeMode === 'field-selector') {
    const sel = botoesFieldSelector.find(b => b.classList.contains('row-selected'));
    if (sel && sel._campo) {
      setCampoTextoAtivo(sel._campo);
      setActivePanel('keyboard');
      resetSelection();
    }
    return;
  }

  if (activeMode === 'toolbar') {
    const sel = botoesToolbar.find(b => b.classList.contains('row-selected') || b.classList.contains('selected'));
    if (sel) { sel.click(); return; } else { startToolbarCycle(); }
    return;
  }

  if (activeMode === 'controls') {
    if (!selectingColumn) {
      startControlsColumnCycle();
      return;
    }
    const selBtn = getCurrentlySelectedControlButton();
    if (selBtn) {
      try { selBtn.click(); } catch (e) { }
    }
    resetSelection();
    return;
  }

  // keyboard / numpad
  if (!selectingColumn) {
    const foundSpace = botoesTeclado.find(entry => {
      const { node } = normalizeEntry(entry);
      return node && node.classList && node.classList.contains('row-selected') && node.classList.contains('space-row');
    });
    if (foundSpace) {
      processarTecla('space');
      resetSelection();
      return;
    }
    startColumnCycle();
    return;
  }

  // estamos na fase de coluna -> pega o item selecionado
  const selItem = getCurrentlySelectedItemKeyboard();
  console.log('[KB] selecionarTeclaAtual -> resolving selItem:', selItem);

  // fallback: quando selItem vazio/undefined, inspeciona DOM diretamente
  if (selItem === undefined || selItem === '' || selItem === null) {
    const kbRoot = document.getElementById('keyboard');
    if (kbRoot) {
      // tenta elemento com .selected primeiro
      let el = kbRoot.querySelector('.selected, .row-selected');
      if (!el) {
        // fallback: elemento na linha corrente
        el = kbRoot.querySelector('.row-selected .selected, .row-selected');
      }
      if (el) {
        // tenta inferir ação por dataset
        if (el.dataset && el.dataset.action) {
          processarTecla({ type: 'action', action: el.dataset.action, icon: el.dataset.icon || null });
          resetSelection();
          return;
        }
        if (el.dataset && el.dataset.value === 'enter') {
          processarTecla('enter');
          resetSelection();
          return;
        }
        if (el.dataset && el.dataset.value === 'space') {
          processarTecla('space');
          resetSelection();
          return;
        }
        // se for half-btn com alias
        const aid = el.getAttribute && el.getAttribute('data-alias-id');
        if (aid && window.__kb_specials_aliases && window.__kb_specials_aliases[aid]) {
          const ali = window.__kb_specials_aliases[aid];
          // ali pode ser elemento com dataset.action
          if (ali.dataset && ali.dataset.action) {
            processarTecla({ type: 'action', action: ali.dataset.action, icon: ali.dataset.icon || null });
            resetSelection();
            return;
          }
        }
        // se elemento tem click handler (botão de letra), simula click
        try { el.click(); resetSelection(); return; } catch (e) { /* continue */ }
      }
    }
    // última tentativa: se numpad, delega
    if (activeMode === 'numpad') {
      selecionarTeclaNumpadAtual();
      return;
    }
    resetSelection();
    return;
  }

  // se temos selItem válido, processa
  if (typeof selItem === 'object' && selItem.type === 'action') processarTecla(selItem);
  else if (typeof selItem === 'object' && selItem.type === 'special' && selItem.char === 'enter') processarTecla('enter');
  else processarTecla(selItem);

  resetSelection();
}

function getCurrentlySelectedItemKeyboard() {
  // Varre botões conhecidos (modelo) procurando por .selected
  for (let i = 0; i < botoesTeclado.length; i++) {
    const entry = botoesTeclado[i];
    const { node, meta } = normalizeEntry(entry);
    if (!node) continue;

    // compound cells (half-btns)
    if (node.classList && node.classList.contains('compound-cell')) {
      const halves = (meta && meta.halves && Array.isArray(meta.halves)) ? meta.halves : Array.from(node.querySelectorAll('.half-btn'));
      for (let h = 0; h < halves.length; h++) {
        const half = halves[h];
        if (half.classList.contains('selected')) {
          // prioriza objetos internos (_numpadAction)
          if (half._numpadAction) return half._numpadAction;
          if (half.dataset && half.dataset.action) return { type: 'action', action: half.dataset.action, icon: half.dataset.icon || null };
          if (half.dataset && half.dataset.value === 'enter') return 'enter';
          if (half.dataset && half.dataset.value === 'space') return 'space';
          if (half.dataset && half.dataset.value === 'caps') return 'caps';
          // fallback para texto
          const txt = (half.textContent || '').trim();
          if (txt) return txt;
          // tenta alias
          const aid = half.getAttribute && half.getAttribute('data-alias-id');
          if (aid && window.__kb_specials_aliases && window.__kb_specials_aliases[aid]) {
            const ali = window.__kb_specials_aliases[aid];
            if (ali.dataset && ali.dataset.action) return { type: 'action', action: ali.dataset.action, icon: ali.dataset.icon || null };
          }
          return undefined;
        }
      }
    }

    // Se nó está marcado como selecionado
    if (node.classList && node.classList.contains('selected')) {
      // espaço
      if (node.classList.contains('space-row')) return 'space';
      // numpad
      if (node.classList.contains('num-btn')) return (meta && meta.value) || node.textContent;
      // meta.value (for simple/special/action entries)
      if (meta && (meta.type === 'simple' || meta.type === 'special' || meta.type === 'action')) {
        // se for action com objeto, devolve objeto
        if (meta.type === 'action' && meta.value) return meta.value;
        if (meta.value) return meta.value;
      }
      // se elemento tiver dataset.action (icon buttons)
      if (node.dataset && node.dataset.action) return { type: 'action', action: node.dataset.action, icon: node.dataset.icon || null };
      if (node.dataset && node.dataset.value === 'enter') return 'enter';
      const txt = (node.textContent || '').trim();
      if (txt) return txt;
      const aid = node.getAttribute && node.getAttribute('data-alias-id');
      if (aid && window.__kb_specials_aliases && window.__kb_specials_aliases[aid]) {
        const ali = window.__kb_specials_aliases[aid];
        if (ali.dataset && ali.dataset.action) return { type: 'action', action: ali.dataset.action, icon: ali.dataset.icon || null };
      }
      return undefined;
    }
  }

  // se nada em .selected -> procura por .row-selected (linha)
  for (let i = 0; i < botoesTeclado.length; i++) {
    const entry = botoesTeclado[i];
    const { node, meta } = normalizeEntry(entry);
    if (!node) continue;

    if (node.classList && node.classList.contains('row-selected')) {
      if (node.classList.contains('space-row')) return 'space';
      if (node.classList.contains('num-btn')) return (meta && meta.value) || node.textContent;
      if (meta && (meta.type === 'simple' || meta.type === 'special' || meta.type === 'action')) return meta.value;
      const txt = (node.textContent || '').trim();
      if (txt) return txt;
      if (node.dataset && node.dataset.action) return { type: 'action', action: node.dataset.action, icon: node.dataset.icon || null };
      const aid = node.getAttribute && node.getAttribute('data-alias-id');
      if (aid && window.__kb_specials_aliases && window.__kb_specials_aliases[aid]) {
        const ali = window.__kb_specials_aliases[aid];
        if (ali.dataset && ali.dataset.action) return { type: 'action', action: ali.dataset.action, icon: ali.dataset.icon || null };
      }
      return undefined;
    }
  }

  return undefined;
}

function selecionarTeclaNumpadAtual() {
  console.log('[BLINK] selecionarTeclaNumpadAtual called');
  if (activeMode !== 'numpad') return;
  if (!selectingColumn) startColumnCycle();
  else selecionarTeclaAtual();
}

/* ============ RESET / SET MODE ============ */
function resetSelection() {
  stopAllTimers();
  stopToolbarTimers();
  stopFieldSelectorTimers();

  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if (!node) return;
    removeClassFromElement(node, 'selected');
    removeClassFromElement(node, 'row-selected');
  });

  if (botoesToolbar && botoesToolbar.length) {
    botoesToolbar.forEach(b => b.classList && b.classList.remove('selected', 'row-selected'));
  }

  if (botoesControls && botoesControls.length) clearControlsSelections();

  if (botoesFieldSelector && botoesFieldSelector.length) {
    botoesFieldSelector.forEach(b => b.classList && b.classList.remove('selected', 'row-selected'));
  }

  currentRow = 0;
  currentCol = 0;
  currentSub = 0;
  selectingColumn = false;
  colRounds = 0;

  if (activeMode === 'keyboard' || activeMode === 'numpad') startRowCycle(true);
  else if (activeMode === 'toolbar') startToolbarCycle(true);
  else if (activeMode === 'controls') startControlsRowCycle(true);
  else if (activeMode === 'field-selector') startFieldSelectorCycle(true);
}

function setActiveMode(mode) {
  if (mode !== 'keyboard' && mode !== 'numpad' && mode !== 'toolbar' && mode !== 'controls' && mode !== 'field-selector') return;

  stopAllTimers();
  stopToolbarTimers();
  stopFieldSelectorTimers();

  toolbarIndex = 0;
  controlsRowIndex = 0;
  currentRow = 0;

  activeMode = mode;
  try { window.activeMode = activeMode; } catch (e) { }

  const panelRoot = document.getElementById('keyboard-panel');
  const kbEl = document.getElementById('keyboard');
  let controlsEl = document.getElementById('controls');
  if (!controlsEl) controlsEl = garantirControls();

  const fieldSelectorEl = document.getElementById('field-selector');
  const toolbarPlaceholder = document.getElementById('toolbar-placeholder');
  const toolbarEl = (toolbarPlaceholder && toolbarPlaceholder.querySelector('.toolbar')) || document.querySelector('.toolbar');

  if (window.__kb_debug) {
    console.log('[KB] setActiveMode:', mode, {
      kbEl: !!kbEl,
      controlsEl: !!controlsEl,
      fieldSelectorEl: !!fieldSelectorEl,
      toolbarEl: !!toolbarEl
    });
  }

  // FORÇA ESCONDER TODOS OS PAINÉIS
  if (kbEl) {
    kbEl.classList.add('hidden');
    kbEl.style.display = 'none'; // FORÇA
    kbEl.setAttribute('aria-hidden', 'true');
  }
  if (controlsEl) {
    controlsEl.classList.add('hidden');
    controlsEl.style.display = 'none'; // FORÇA
    controlsEl.setAttribute('aria-hidden', 'true');
  }
  if (fieldSelectorEl) {
    fieldSelectorEl.classList.add('hidden');
    fieldSelectorEl.style.display = 'none'; // FORÇA
    fieldSelectorEl.setAttribute('aria-hidden', 'true');
  }

  if (mode === 'keyboard') {
    if (kbEl) {
      kbEl.classList.remove('hidden');
      kbEl.style.display = ''; // REMOVE FORÇA
      kbEl.setAttribute('aria-hidden', 'false');
      criarTeclado();
    }
    if (!toolbarEl) criarToolbar();
    if (toolbarEl) {
      toolbarEl.classList.remove('hidden');
      toolbarEl.style.display = '';
    }
    if (window.__kb_debug) console.log('[KB] Mode: KEYBOARD ✓');
  }
  else if (mode === 'numpad') {
    if (kbEl) {
      kbEl.classList.remove('hidden');
      kbEl.style.display = '';
      kbEl.setAttribute('aria-hidden', 'false');
      criarNumpad();
    }
    if (!toolbarEl) criarToolbar();
    if (toolbarEl) {
      toolbarEl.classList.remove('hidden');
      toolbarEl.style.display = '';
    }
    if (window.__kb_debug) console.log('[KB] Mode: NUMPAD ✓');
  }
  else if (mode === 'toolbar') {
    if (kbEl) {
      kbEl.classList.remove('hidden');
      kbEl.style.display = '';
      kbEl.setAttribute('aria-hidden', 'false');
      criarTeclado();
    }
    if (!toolbarEl) criarToolbar();
    if (toolbarEl) {
      toolbarEl.classList.remove('hidden');
      toolbarEl.style.display = '';
    }
    if (window.__kb_debug) console.log('[KB] Mode: TOOLBAR ✓');
  }
  else if (mode === 'controls') {
    if (window.__kb_debug) console.log('[KB] Entrando em CONTROLS mode...');

    if (kbEl) {
      kbEl.classList.add('hidden');
      kbEl.style.display = 'none'; // FORÇA ESCONDER
      kbEl.setAttribute('aria-hidden', 'true');
      if (window.__kb_debug) console.log('[KB] #keyboard FORÇADO A ESCONDER');
    }

    if (!controlsEl) controlsEl = garantirControls();

    if (controlsEl) {
      criarTeclado();
      ensureControlsBaseGroups();
      buildControlsModel();
      controlsEl.classList.remove('hidden');
      controlsEl.style.display = 'block'; // FORÇA MOSTRAR
      controlsEl.setAttribute('aria-hidden', 'false');
      if (window.__kb_debug) console.log('[KB] Controls visível ✓', controlsEl);
    } else {
      console.error('[KB] CRÍTICO: Não conseguiu criar controls!');
    }

    if (!toolbarEl) criarToolbar();
    if (toolbarEl) {
      toolbarEl.classList.remove('hidden');
      toolbarEl.style.display = '';
    }
    if (window.__kb_debug) console.log('[KB] Mode: CONTROLS ✓');
  }
  else if (mode === 'field-selector') {
    if (kbEl) {
      kbEl.classList.add('hidden');
      kbEl.style.display = 'none';
      kbEl.setAttribute('aria-hidden', 'true');
    }
    if (fieldSelectorEl) {
      criarPainelSelecaoCampo();
      fieldSelectorEl.classList.remove('hidden');
      fieldSelectorEl.style.display = 'block';
      fieldSelectorEl.setAttribute('aria-hidden', 'false');
    }
    if (toolbarEl) {
      toolbarEl.classList.add('hidden');
      toolbarEl.style.display = 'none';
    }
    if (window.__kb_debug) console.log('[KB] Mode: FIELD-SELECTOR ✓');
  }

  resetSelection();
}

function setActivePanel(panelName) {
  if (panelName === 'keyboard') setActiveMode('keyboard');
  else if (panelName === 'numpad') setActiveMode('numpad');
  else if (panelName === 'toolbar') setActiveMode('toolbar');
  else if (panelName === 'controls') setActiveMode('controls');
  else if (panelName === 'field-selector') setActiveMode('field-selector');
}

/* ============ INIT ============ */
async function init() {
  const toPreload = ['backspace', 'gear', 'trash', 'spacebar', 'enter', 'tools', 'plus', 'forward_tab', 'forward_tab_rev', 'x', 'target', '123', 'abc'];
  await Promise.all(toPreload.map(n => preloadIcon(n).catch(() => { })));

  const kp = document.getElementById('keyboard-panel');
  if (kp) {
    let kb = document.getElementById('keyboard');
    if (!kb) {
      kb = document.createElement('div');
      kb.id = 'keyboard';
      kb.className = 'grid-6cols';
      kp.appendChild(kb);
    }
  }

  garantirControls();
  ensureControlsBaseGroups();
  buildControlsModel();
  criarToolbar();
  criarTeclado();
  updateRowIntervalDisplay();
  setActiveMode(activeMode);

  if (window.__kb_debug) console.log('[KB] ✅ Inicialização completa');
}

// NOVA FUNÇÃO: Iniciar detecção + target automaticamente
async function iniciarDeteccaoAutomatica() {
  if (window.__kb_debug) console.log('[KB] 🎯 Iniciando detecção automática...');

  // Aguarda um pequeno delay para garantir que tudo está pronto
  await new Promise(resolve => setTimeout(resolve, 500));

  // Aciona target automaticamente
  await acionarTarget();

  // Inicia ciclo de reconhecimento
  resetSelection();

  if (window.__kb_debug) console.log('[KB] ✅ Detecção automática iniciada');
}

// Expor função globalmente para ser chamada pelo botão Continuar
window.iniciarDeteccaoAutomatica = iniciarDeteccaoAutomatica;

/* ============ EVENT LISTENERS ============ */
document.addEventListener('toolbar:action', (e) => {
  const action = e.detail && e.detail.action;
  if (window.__kb_debug) console.log('[KB] toolbar:action:', action);

  if (action === 'target') {
    if (window.__kb_debug) console.log('[KB] Acionando target...');
    acionarTarget();
  }
  else if (action === 'back') {
    if (window.__kb_debug) console.log('[KB] Back');
    irParaAbaAnterior();
  }
  else if (action === 'forward') {
    if (window.__kb_debug) console.log('[KB] Forward');
    irParaProximaAba();
  }
  else if (action === 'plus') {
    if (window.__kb_debug) console.log('[KB] Plus');
    abrirNovaAba();
  }
  else if (action === 'x') {
    if (window.__kb_debug) console.log('[KB] X');
    fecharAbaAtual();
  }
}, false);

document.addEventListener('DOMContentLoaded', () => {
  init().catch(console.error);
});

document.addEventListener('click', (ev) => {
  try {
    const el = ev.target.closest && ev.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (!action) return;

    if (action === 'openTabs' || action === 'openTabs'.toLowerCase()) {
      setActivePanel('toolbar');
      resetSelection();
      ev.preventDefault();
      return;
    }
    if (action === 'backspace') {
      const out = getCampoTextoAtivo();
      if (out) out.value = out.value.slice(0, -1);
      resetSelection();
      ev.preventDefault();
      return;
    }
    if (action === 'clearAll') {
      const out = getCampoTextoAtivo();
      if (out) out.value = '';
      resetSelection();
      ev.preventDefault();
      return;
    }
  } catch (err) {
    if (window.__kb_debug) console.warn('[KB] delegated data-action error', err);
  }
}, true);

/* ============ EXPOR APIS GLOBALMENTE ============ */
// Expor no contexto do content script
window.selecionarTeclaAtual = selecionarTeclaAtual;
window.selecionarTeclaNumpadAtual = selecionarTeclaNumpadAtual;
window.resetSelection = resetSelection;
window.toggleCaps = () => { capsAtivo = !capsAtivo; criarTeclado(); };
window.setActivePanel = setActivePanel;
window.setActiveMode = setActiveMode;
window.mostrarPainelSelecaoCampo = mostrarPainelSelecaoCampo;
window.detectarCamposTexto = detectarCamposTexto;
window.encontrarPrimeiroCampoTexto = encontrarPrimeiroCampoTexto;
window.acionarTarget = acionarTarget;
window.garantirControls = garantirControls;
window.getCampoTextoAtivo = getCampoTextoAtivo;
window.setCampoTextoAtivo = setCampoTextoAtivo;

function validarFuncionalidades() {
  const checks = {
    '✅ selecionarTeclaAtual': typeof window.selecionarTeclaAtual === 'function',
    '✅ acionarTarget': typeof window.acionarTarget === 'function',
    '✅ setActivePanel': typeof window.setActivePanel === 'function',
    '✅ resetSelection': typeof window.resetSelection === 'function',
    '✅ processarTecla': typeof processarTecla === 'function',
    '✅ getCampoTextoAtivo': typeof getCampoTextoAtivo === 'function',
    '✅ enviarTextoParaCampoExterno': typeof enviarTextoParaCampoExterno === 'function',
    '✅ enviarAcaoParaCampoExterno': typeof enviarAcaoParaCampoExterno === 'function',
    '✅ abrirNovaAba': typeof abrirNovaAba === 'function',
    '✅ irParaAbaAnterior': typeof irParaAbaAnterior === 'function',
    '✅ irParaProximaAba': typeof irParaProximaAba === 'function',
    '✅ fecharAbaAtual': typeof fecharAbaAtual === 'function',
    '✅ criarTeclado': typeof criarTeclado === 'function',
    '✅ criarNumpad': typeof criarNumpad === 'function',
    '✅ criarToolbar': typeof criarToolbar === 'function',
    '✅ BlinkDetection disponível': typeof window.BlinkDetection === 'object'
  };

  console.log('[KB] 🔍 VALIDAÇÃO DE FUNCIONALIDADES:');
  Object.entries(checks).forEach(([name, ok]) => {
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  });

  const allOk = Object.values(checks).every(v => v);
  if (allOk) {
    console.log('[KB] ✅ TODAS AS FUNCIONALIDADES OK!');
  } else {
    console.warn('[KB] ⚠️ ALGUMAS FUNCIONALIDADES FALTANDO!');
  }

  return checks;
}

// Chama validação após init
document.addEventListener('DOMContentLoaded', () => {
  init().then(() => {
    setTimeout(() => validarFuncionalidades(), 500);
  }).catch(console.error);
});