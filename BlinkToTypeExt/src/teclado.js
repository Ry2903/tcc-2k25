/* teclado.js (completo - com logs de debug para seleção/piscada) */

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
let activeMode = 'keyboard'; // 'keyboard' | 'numpad' | 'toolbar' | 'controls'

const numColunas = 6;

let rowInterval = 1200; // ms entre mudanças de linha (configurável)
let firstRowDelay = rowInterval + 600;

let controlsRowInterval = rowInterval + 900;
let controlsFirstRowDelay = firstRowDelay + 600;

const COL_ROUNDS_MAX = 3;

/* ---------------- timers / estado runtime ---------------- */
let rowIntervalId = null;
let colIntervalId = null;
let initialTimeoutId = null;

let toolbarRowIntervalId = null;
let toolbarInitialTimeoutId = null;
let toolbarIndex = 0;

let controlsRowIntervalId = null;
let controlsColIntervalId = null;
let controlsInitialTimeoutId = null;

let currentRow = 0;
let currentCol = 0;
let currentSub = 0;
let colRounds = 0;
let selectingColumn = false;

if (typeof window !== 'undefined' && window.__kb_debug === undefined) window.__kb_debug = false;

/* registry global (útil para debug e para listeners externos) */
if (typeof window !== 'undefined') {
  window.__kb_specials = window.__kb_specials || {};
  window.__kb_specials_aliases = window.__kb_specials_aliases || {};
}

/* ---------------- ICON HELPERS ---------------- */
const iconsCache = {};
const PRESERVE_STYLES = new Set(['backspace', 'trash']);
const ICONS_BASE = (function () {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      return chrome.runtime.getURL('icons/');
    }
  } catch (e) { /* ignore */ }
  return '../icons/';
})();

function wrapIconHTML(svgInner, name, preserve = false) {
  const cls = preserve ? 'btn-icon preserve' : 'btn-icon';
  if (name === 'spacebar') return `<span class="${cls} space-icon" aria-hidden="true">${svgInner}</span>`;
  return `<span class="${cls}" aria-hidden="true">${svgInner}</span>`;
}

function iconSVGFallback(name) {
  if (name === 'gear') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4z"/></svg>`, name);
  if (name === 'trash') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M6 7h12v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7z"/></svg>`, name, true);
  if (name === 'backspace') return wrapIconHTML(`<svg viewBox="0 0 16 16"><path d="M15.683 3a2 2 0 0 0-2-2h-7.08a2 2 0 0 0-1.519.698L.241 7.35a1 1 0 0 0 0 1.302l4.843 5.65A2 2 0 0 0 6.603 15h7.08a2 2 0 0 0 2-2zM5.829 5.854a.5.5 0 1 1 .707-.708l2.147 2.147 2.146-2.147a.5.5 0 1 1 .707.708L9.39 8l2.146 2.146a.5.5 0 0 1-.707.708L8.683 8.707l-2.147 2.147a.5.5 0 0 1-.707-.708L7.976 8z"/></svg>`, name, true);
  if (name === 'question') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-2h2z"/></svg>`, name);
  if (name === 'spacebar') return wrapIconHTML(`<svg viewBox="0 0 24 24"><rect x="2" y="8" width="20" height="8" rx="2"/></svg>`, name);
  if (name === 'enter' || name === 'return') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M5 12h10l-4-4 1.4-1.4L19 12l-6.6 6.4L10 17l4-4H5z"/></svg>`, name);
  if (name === 'tools') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`, name);
  if (name === 'plus') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg>`, name);
  if (name === 'forward_tab') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M7 7h10v2H7z"/></svg>`, name);
  if (name === 'forward_tab_rev') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M7 7h10v2H7z"/></svg>`, name);
  if (name === 'x') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M6 6l12 12M6 18L18 6"/></svg>`, name);
  if (name === '123' || name === 'abc') return wrapIconHTML(`<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/></svg>`, name);
  return `<span class="btn-icon" aria-hidden="true"></span>`;
}

async function preloadIcon(name) {
  if (!name) return;
  if (iconsCache[name]) return;
  try {
    const resp = await fetch(ICONS_BASE + name + '.svg');
    if (!resp.ok) throw new Error('SVG not found: ' + name + ' @ ' + (ICONS_BASE + name + '.svg'));
    let svg = await resp.text();
    svg = svg.replace(/<\?xml[\s\S]*?\?>/i, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s(width|height)="[^"]*"/gi, '');
    svg = svg.replace(/<svg([^>]*)>/i, (m, attrs) => {
      if (/preserveAspectRatio=/i.test(attrs)) return `<svg${attrs} width="100%" height="100%">`;
      return `<svg${attrs} preserveAspectRatio="xMidYMid meet" width="100%" height="100%">`;
    });
    if (PRESERVE_STYLES.has(name)) { iconsCache[name] = wrapIconHTML(svg, name, true); return; }
    svg = svg.replace(/(fill|stroke)=['"]([^'"]*)['"]/gi, (m, a, v) => {
      if (/currentColor/i.test(v) || /none/i.test(v)) return `${a}="${v}"`;
      return `${a}="currentColor"`;
    });
    iconsCache[name] = wrapIconHTML(svg, name, false);
  } catch (err) {
    iconsCache[name] = iconSVGFallback(name);
    if (window.__kb_debug) console.warn('preloadIcon failed', name, err);
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

/* ---------------- normalize / helpers ---------------- */
function normalizeEntry(entry) {
  if (!entry) return { node: null, occ: 0, meta: null };
  if (entry.el) return { node: entry.el, occ: (typeof entry.occ === 'number') ? entry.occ : 0, meta: entry };
  if (entry instanceof Element) return { node: entry, occ: 0, meta: null };
  return { node: null, occ: 0, meta: null };
}

function blurIfFocusedInside(el, fallbackSelector = 'body') {
  try {
    if (!el) return;
    const active = document.activeElement;
    if (!active) return;
    if (el.contains(active)) {
      const fallback = document.querySelector(fallbackSelector) || document.body;
      try { fallback.focus && fallback.focus(); } catch (e) { /* ignore */ }
      if (el.contains(document.activeElement)) {
        try { document.activeElement.blur(); } catch (e) { /* ignore */ }
      }
    }
  } catch (e) {
    if (window.__kb_debug) console.warn('blurIfFocusedInside failed', e);
  }
}

function isElementNode(node) { return node && typeof node === 'object' && node.nodeType === 1; }
function addClassToElement(el, cls) { if (!isElementNode(el)) return; if (!el.classList.contains(cls)) el.classList.add(cls); }
function removeClassFromElement(el, cls) { if (!isElementNode(el)) return; if (el.classList.contains(cls)) el.classList.remove(cls); }

/* ---------------- apply/remove selection classes ---------------- */
function applyClassToEntry(entry, cls, opts = { applyToWrapperIfCompound: true }) {
  const { node, occ, meta } = normalizeEntry(entry);
  if (!node || !isElementNode(node)) return;

  if (node.classList.contains('compound-cell')) {
    if (node.classList.contains('special-wrapper')) {
      const halves = Array.from(node.querySelectorAll('.half-btn'));
      const rowSpan = Math.max(1, parseInt(node.dataset.rowSpan || '1', 10));
      const halvesPerRow = Math.ceil(halves.length / rowSpan);
      if (typeof occ === 'number') {
        const start = occ * halvesPerRow;
        for (let i = start; i < start + halvesPerRow && i < halves.length; i++) addClassToElement(halves[i], cls);
      } else halves.forEach(h => addClassToElement(h, cls));
      return;
    }
    node.querySelectorAll('.half-btn').forEach(h => addClassToElement(h, cls));
    if (opts.applyToWrapperIfCompound) addClassToElement(node, cls);
    return;
  }

  addClassToElement(node, cls);
}

function removeClassFromEntry(entry, cls) {
  const { node, occ, meta } = normalizeEntry(entry);
  if (!node || !isElementNode(node)) return;

  if (node.classList.contains('compound-cell')) {
    if (node.classList.contains('special-wrapper')) {
      const halves = Array.from(node.querySelectorAll('.half-btn'));
      const rowSpan = Math.max(1, parseInt(node.dataset.rowSpan || '1', 10));
      const halvesPerRow = Math.ceil(halves.length / rowSpan);
      if (typeof occ === 'number') {
        const start = occ * halvesPerRow;
        for (let i = start; i < start + halvesPerRow && i < halves.length; i++) removeClassFromElement(halves[i], cls);
      } else halves.forEach(h => removeClassFromElement(h, cls));
      removeClassFromElement(node, cls);
      return;
    }
    node.querySelectorAll('.half-btn').forEach(h => removeClassFromElement(h, cls));
    removeClassFromElement(node, cls);
    return;
  }

  removeClassFromElement(node, cls);
}

/* ---------------- CONTROLS model ---------------- */
function buildControlsModel() {
  botoesControls = [];
  const groups = Array.from(document.querySelectorAll('#controls .config-group'));
  groups.forEach(group => {
    const btnContainer = group.querySelector('.config-buttons');
    if (!btnContainer) return;
    const buttons = Array.from(btnContainer.querySelectorAll('button'));
    let type = 'single';
    if (buttons.length >= 2) type = 'pair';
    botoesControls.push({ el: btnContainer, buttons, groupEl: group, type });
  });

  ensureControlsGearButton();
  ensureControlsRowIntervalButton();

  const gearBtn = document.getElementById('settings-gear-btn');
  if (gearBtn) {
    const wrap = gearBtn.parentElement;
    const groupEl = wrap ? wrap.parentElement : null;
    if (!botoesControls.some(c => c.buttons.some(b => b && b.id === 'settings-gear-btn'))) {
      botoesControls.push({ el: wrap, buttons: [gearBtn], groupEl: groupEl, type: 'single' });
    }
  }

  if (window.__kb_debug) console.log('buildControlsModel ->', botoesControls);

  try {
    if (window.parent && window.parent !== window) try {
      const h = Math.max(
        document.documentElement.scrollHeight || 0,
        document.body ? (document.body.scrollHeight || 0) : 0
      );
      window.parent.postMessage({ type: 'blink:resize', height: h }, '*');
    } catch (e) { /* silencioso */ }
  } catch (e) { }
}

function ensureControlsPanel() {
  const panelRoot = document.getElementById('keyboard-panel');
  if (!panelRoot) {
    if (window.__kb_debug) console.warn('ensureControlsPanel: #keyboard-panel não encontrado');
    return null;
  }

  let controls = document.getElementById('controls');
  if (controls) return controls;

  controls = document.createElement('div');
  controls.id = 'controls';
  controls.className = 'hidden';
  controls.setAttribute('aria-hidden', 'true');

  const h2 = document.createElement('h2');
  h2.textContent = 'Ajustes';
  controls.appendChild(h2);

  const grid = document.createElement('div');
  grid.className = 'config-grid';
  controls.appendChild(grid);

  try {
    const toolbarPanel = panelRoot.querySelector('#toolbar-panel');
    const kb = panelRoot.querySelector('#keyboard');

    if (toolbarPanel && toolbarPanel.parentNode === panelRoot) {
      if (toolbarPanel.nextSibling && toolbarPanel.nextSibling.parentNode === panelRoot) {
        toolbarPanel.parentNode.insertBefore(controls, toolbarPanel.nextSibling);
      } else {
        toolbarPanel.parentNode.appendChild(controls);
      }
    } else if (kb && kb.parentNode === panelRoot) {
      if (kb.nextSibling && kb.nextSibling.parentNode === panelRoot) {
        kb.parentNode.insertBefore(controls, kb.nextSibling);
      } else {
        kb.parentNode.appendChild(controls);
      }
    } else {
      panelRoot.appendChild(controls);
    }
  } catch (err) {
    try { panelRoot.appendChild(controls); } catch (e) { /* silencioso */ }
    if (window.__kb_debug) console.warn('ensureControlsPanel: insert fallback usado', err);
  }

  if (window.__kb_debug) console.log('ensureControlsPanel -> criado / inserted', controls);

  try {
    if (window.parent && window.parent !== window) {
      try {
        if (window.parent && window.parent !== window) {
          const h = Math.max(
            document.documentElement.scrollHeight || 0,
            document.body ? (document.body.scrollHeight || 0) : 0
          );
          window.parent.postMessage({ type: 'blink:resize', height: h }, '*');
        }
      } catch (e) { /* silencioso */ }
    }
  } catch (e) { /* silencioso */ }

  return controls;
}

/* ---------------- ensure controls base groups ---------------- */
function ensureControlsBaseGroups() {
  const controls = ensureControlsPanel();
  if (!controls) return;
  const grid = controls.querySelector('.config-grid');
  if (!grid) return;

  if (document.getElementById('threshold-val')) return;

  const mkGroup = (labelText, children = []) => {
    const group = document.createElement('div');
    group.className = 'config-group';
    const label = document.createElement('label');
    label.innerText = labelText || '\u00A0';
    group.appendChild(label);
    const wrap = document.createElement('div');
    wrap.className = 'config-buttons';
    children.forEach(c => wrap.appendChild(c));
    group.appendChild(wrap);
    grid.appendChild(group);
    return { group, wrap };
  };

  const makeBtn = (id, textOrIcon, classes = []) => {
    const b = document.createElement('button');
    if (id) b.id = id;
    classes.forEach(c => b.classList.add(c));
    b.classList.add('icon-btn');
    if (/<svg|</i.test(String(textOrIcon))) b.innerHTML = textOrIcon;
    else b.textContent = textOrIcon;
    return b;
  };

  const thrDec = makeBtn('thr-dec', '<');
  const thrSpan = document.createElement('span'); thrSpan.id = 'threshold-val'; thrSpan.className = 'ctrl-value'; thrSpan.textContent = '0.279';
  const thrInc = makeBtn('thr-inc', '>');
  mkGroup('Threshold', [thrDec, thrSpan, thrInc]);

  const frmDec = makeBtn('frm-dec', '<');
  const frmSpan = document.createElement('span'); frmSpan.id = 'frames-val'; frmSpan.className = 'ctrl-value'; frmSpan.textContent = '1.5';
  const frmInc = makeBtn('frm-inc', '>');
  mkGroup('Frames consecutivos', [frmDec, frmSpan, frmInc]);

  const debDec = makeBtn('deb-dec', '<');
  const debSpan = document.createElement('span'); debSpan.id = 'debounce-val'; debSpan.className = 'ctrl-value'; debSpan.textContent = '1.0';
  const debInc = makeBtn('deb-inc', '>');
  mkGroup('Debounce', [debDec, debSpan, debInc]);

  const rowDec = makeBtn('row-interval-dec', '<');
  const rowVal = document.createElement('span'); rowVal.id = 'row-interval-val'; rowVal.className = 'ctrl-value'; rowVal.textContent = `${rowInterval} ms`;
  const rowInc = makeBtn('row-interval-inc', '>');
  mkGroup('Intervalo entre linhas', [rowDec, rowVal, rowInc]);

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'toggle-detection';
  toggleBtn.className = 'icon-btn';
  toggleBtn.setAttribute('data-detection-active', 'true');
  mkGroup('\u00A0', [toggleBtn]);

  ensureControlsGearButton();

  if (window.__kb_debug) console.log('ensureControlsBaseGroups -> groups created');
}

function ensureControlsGearButton() {
  const controls = ensureControlsPanel();
  if (!controls) return;

  if (document.getElementById('settings-gear-btn')) return;

  const grid = controls.querySelector('.config-grid');
  if (!grid) return;

  const group = document.createElement('div');
  group.className = 'config-group';
  const label = document.createElement('label');
  label.innerHTML = '&nbsp;';
  group.appendChild(label);

  const btnWrap = document.createElement('div');
  btnWrap.className = 'config-buttons';

  const gearBtn = document.createElement('button');
  gearBtn.id = 'settings-gear-btn';
  gearBtn.className = 'icon-btn';
  gearBtn.title = 'Voltar para toolbar';
  gearBtn.innerHTML = getIconHTML('gear');

  gearBtn.addEventListener('click', () => {
    if (window.__kb_debug) console.log('settings-gear-btn clicked -> attempting to switch to toolbar');
    try {
      if (typeof window.setActivePanel === 'function') {
        window.setActivePanel('toolbar');
        if (window.__kb_debug) console.log('settings-gear-btn -> window.setActivePanel used');
      } else if (typeof setActivePanel === 'function') {
        setActivePanel('toolbar');
        if (window.__kb_debug) console.log('settings-gear-btn -> setActivePanel fallback used');
      } else {
        console.warn('settings-gear-btn: setActivePanel not found');
      }
    } catch (e) {
      console.error('settings-gear-btn handler error', e);
    }
    try { resetSelection(); } catch (e) { /* silencioso */ }
  });

  btnWrap.appendChild(gearBtn);
  group.appendChild(btnWrap);
  grid.appendChild(group);

  if (window.__kb_debug) console.log('ensureControlsGearButton -> created');
}

/* ---------------- Cria botão Intervalo entre linhas ---------------- */
function ensureControlsRowIntervalButton() {
  if (document.getElementById('row-interval-val')) return;
  const grid = document.querySelector('#controls .config-grid');
  if (!grid) return;

  const group = document.createElement('div');
  group.className = 'config-group';

  const label = document.createElement('label');
  label.setAttribute('for', 'row-interval-val');
  label.textContent = 'Intervalo entre linhas';
  group.appendChild(label);

  const wrap = document.createElement('div');
  wrap.className = 'config-buttons';

  const dec = document.createElement('button');
  dec.id = 'row-interval-dec';
  dec.textContent = '<';

  const span = document.createElement('span');
  span.id = 'row-interval-val';
  span.textContent = `${rowInterval} ms`;

  const inc = document.createElement('button');
  inc.id = 'row-interval-inc';
  inc.textContent = '>';

  wrap.appendChild(dec);
  wrap.appendChild(span);
  wrap.appendChild(inc);

  group.appendChild(wrap);
  grid.appendChild(group);

  const STEP = 100; // ms step
  dec.addEventListener('click', () => {
    rowInterval = Math.max(200, rowInterval - STEP);
    recalcDerivedIntervals();
    updateRowIntervalDisplay();
    resetSelection();
  });
  inc.addEventListener('click', () => {
    rowInterval = Math.min(5000, rowInterval + STEP);
    recalcDerivedIntervals();
    updateRowIntervalDisplay();
    resetSelection();
  });

  if (window.__kb_debug) console.log('ensureControlsRowIntervalButton -> created');
}

function updateRowIntervalDisplay() {
  const span = document.getElementById('row-interval-val');
  if (span) span.textContent = `${rowInterval} ms`;
}

function recalcDerivedIntervals() {
  firstRowDelay = rowInterval + 600;
  controlsRowInterval = rowInterval + 900;
  controlsFirstRowDelay = firstRowDelay + 600;
  if (window.__kb_debug) console.log('recalcDerivedIntervals ->', { rowInterval, firstRowDelay, controlsRowInterval, controlsFirstRowDelay });
}

function clearControlsSelections() {
  botoesControls.forEach(entry => {
    try {
      if (entry.el) entry.el.classList.remove('row-selected', 'selected');
      if (Array.isArray(entry.buttons)) entry.buttons.forEach(b => { if (b && b.classList) b.classList.remove('row-selected', 'selected'); });
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

/* ---------------- formatting / processing ---------------- */
const especiais = ['caps', '?', 'enter'];
function formatarLabel(item) {
  if (typeof item === 'string') {
    if (especiais.includes(item)) return item;
    return capsAtivo ? item.toUpperCase() : item.toLowerCase();
  }
  return null;
}

/* ---------------- GERENCIAMENTO DE CAMPO ATIVO ---------------- */
let campoTextoAtivo = null; // Campo de input/textarea atualmente selecionado

/**
 * Retorna o campo de texto ativo (ou #output como fallback)
 */
function getCampoTextoAtivo() {
  if (campoTextoAtivo && document.body.contains(campoTextoAtivo)) {
    return campoTextoAtivo;
  }
  // Fallback para #output
  return document.getElementById('output');
}

/**
 * Define qual campo de texto receberá as teclas digitadas
 */
function setCampoTextoAtivo(elemento) {
  // Remove highlight anterior
  if (campoTextoAtivo) {
    campoTextoAtivo.classList.remove('kb-campo-ativo');
  }

  campoTextoAtivo = elemento;

  // Adiciona highlight visual
  if (campoTextoAtivo) {
    campoTextoAtivo.classList.add('kb-campo-ativo');
    campoTextoAtivo.focus();
  }

  if (window.__kb_debug) {
    console.log('Campo ativo alterado:', {
      id: elemento?.id,
      name: elemento?.name,
      placeholder: elemento?.placeholder
    });
  }
}

/**
 * Detecta todos os campos de texto disponíveis na página
 */
function detectarCamposTexto() {
  const seletores = [
    'input[type="text"]',
    'input[type="search"]',
    'input[type="email"]',
    'input[type="url"]',
    'input[type="tel"]',
    'input:not([type])', // inputs sem type definido
    'textarea'
  ];

  const campos = document.querySelectorAll(seletores.join(','));
  return Array.from(campos).filter(campo => {
    // Filtra apenas campos visíveis e editáveis
    const style = window.getComputedStyle(campo);
    return (
      !campo.disabled &&
      !campo.readOnly &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  });
}

/**
 * Cria painel de seleção de campo de texto
 */
function criarPainelSelecaoCampo() {
  const panelRoot = document.getElementById('keyboard-panel');
  if (!panelRoot) return;

  // Remove painel anterior se existir
  let painel = document.getElementById('campo-selector');
  if (painel) painel.remove();

  painel = document.createElement('div');
  painel.id = 'campo-selector';
  painel.className = 'campo-selector hidden';
  painel.setAttribute('aria-hidden', 'true');

  const titulo = document.createElement('h3');
  titulo.textContent = 'Selecionar Campo de Texto';
  titulo.style.cssText = 'color: #fff; margin-bottom: 15px; font-size: 18px;';
  painel.appendChild(titulo);

  const lista = document.createElement('div');
  lista.className = 'campo-lista';
  lista.style.cssText = 'display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto;';

  const campos = detectarCamposTexto();

  if (campos.length === 0) {
    const aviso = document.createElement('p');
    aviso.textContent = 'Nenhum campo de texto encontrado na página.';
    aviso.style.cssText = 'color: #999; font-style: italic;';
    lista.appendChild(aviso);
  } else {
    campos.forEach((campo, index) => {
      const btn = document.createElement('button');
      btn.className = 'campo-btn';
      btn.style.cssText = `
        padding: 12px 16px;
        background: rgba(142, 212, 255, 0.1);
        border: 2px solid transparent;
        border-radius: 6px;
        color: #fff;
        text-align: left;
        cursor: pointer;
        transition: all 0.2s;
      `;

      // Label descritivo do campo
      const label = campo.placeholder ||
        campo.name ||
        campo.id ||
        `Campo ${index + 1}`;

      btn.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 4px;">${label}</div>
        <div style="font-size: 12px; color: #8ED4FF;">
          ${campo.tagName.toLowerCase()}${campo.id ? '#' + campo.id : ''}
        </div>
      `;

      // Highlight se for o campo ativo
      if (campo === campoTextoAtivo) {
        btn.style.borderColor = '#4ade80';
        btn.style.background = 'rgba(74, 222, 128, 0.2)';
      }

      btn.addEventListener('click', () => {
        setCampoTextoAtivo(campo);
        setActivePanel('keyboard'); // Volta para o teclado
        resetSelection();
      });

      btn.addEventListener('mouseenter', () => {
        if (campo !== campoTextoAtivo) {
          btn.style.borderColor = '#8ED4FF';
          btn.style.background = 'rgba(142, 212, 255, 0.2)';
        }
      });

      btn.addEventListener('mouseleave', () => {
        if (campo !== campoTextoAtivo) {
          btn.style.borderColor = 'transparent';
          btn.style.background = 'rgba(142, 212, 255, 0.1)';
        }
      });

      lista.appendChild(btn);
    });
  }

  painel.appendChild(lista);

  // Botão voltar
  const btnVoltar = document.createElement('button');
  btnVoltar.textContent = '← Voltar ao Teclado';
  btnVoltar.style.cssText = `
    margin-top: 15px;
    padding: 10px 20px;
    background: rgba(255,255,255,0.1);
    border: none;
    border-radius: 6px;
    color: #fff;
    cursor: pointer;
    width: 100%;
  `;
  btnVoltar.addEventListener('click', () => {
    setActivePanel('keyboard');
    resetSelection();
  });
  painel.appendChild(btnVoltar);

  panelRoot.appendChild(painel);

  if (window.__kb_debug) {
    console.log('Painel de seleção criado com', campos.length, 'campos');
  }
}

/**
 * Mostra o painel de seleção de campo
 */
function mostrarPainelSelecaoCampo() {
  criarPainelSelecaoCampo();

  const painel = document.getElementById('campo-selector');
  const kbEl = document.getElementById('keyboard');
  const controlsEl = document.getElementById('controls');

  // Esconde outros painéis
  [kbEl, controlsEl].forEach(el => {
    if (el) {
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
    }
  });

  // Mostra painel de seleção
  if (painel) {
    painel.classList.remove('hidden');
    painel.setAttribute('aria-hidden', 'false');
  }

  stopAllTimers();
}

function processarTecla(item) {
  const out = getCampoTextoAtivo(); // ← Agora usa o campo ativo
  if (!out) {
    console.warn('Nenhum campo de texto disponível');
    return;
  }

  if (typeof item === 'object' && item.type === 'action') {
    if (item.action === 'clearAll') {
      out.value = '';
      return;
    }
    if (item.action === 'openTabs') {
      setActivePanel('toolbar');
      return;
    }
    if (item.action === 'backspace') {
      out.value = out.value.slice(0, -1);
      return;
    }
    if (item.action === 'selectField') { // ← Nova ação
      mostrarPainelSelecaoCampo();
      return;
    }
    return;
  }

  if (item === 'caps') {
    capsAtivo = !capsAtivo;
    criarTeclado();
    return;
  }

  if (item === 'enter') {
    document.dispatchEvent(new CustomEvent('keyboard:enter', {
      detail: { value: out.value, field: out }
    }));
    return;
  }

  if (item === 'space') {
    out.value += ' ';
    return;
  }

  out.value += formatarLabel(item);

  // Dispara evento de input para compatibilidade com frameworks
  out.dispatchEvent(new Event('input', { bubbles: true }));
}

/* -------------------- DOM helpers ---------------- */
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

/* ---------------- criar teclado ---------------- */
function criarTeclado() {
  window.__kb_specials = window.__kb_specials || {};
  window.__kb_specials_aliases = window.__kb_specials_aliases || {};

  const container = getKeyboardContainer();
  if (!container) return;
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
          half.dataset.action = sub.action || '';
          if (sub.icon) half.dataset.icon = sub.icon;
          half.classList.add('action-btn', 'icon-btn', 'key-special');
          half.innerHTML = getIconHTML(sub.icon || '');
          half.addEventListener('click', () => { if (typeof activeMode !== 'undefined' && activeMode !== 'keyboard') return; processarTecla(sub); resetSelection(); });
          window.__kb_specials[half.id] = half;
          const aliasId = `key-action-${sub.icon || sub.action || idKey}`;
          window.__kb_specials_aliases[aliasId] = half;
          half.setAttribute('data-alias-id', aliasId);
        } else {
          if (sub === 'enter') {
            half.id = `key-special-enter-${index}-${subIndex}`;
            half.classList.add('key-special', 'icon-btn');
            half.innerHTML = getIconHTML('enter');
            half.addEventListener('click', () => { if (typeof activeMode !== 'undefined' && activeMode !== 'keyboard') return; processarTecla('enter'); resetSelection(); });
            window.__kb_specials[half.id] = half;
            const aliasId = `key-action-enter-${index}-${subIndex}`;
            window.__kb_specials_aliases[aliasId] = half;
            half.setAttribute('data-alias-id', aliasId);
          } else if (sub === 'caps') {
            half.id = `key-action-caps-${index}-${subIndex}`;
            half.classList.add('key-special', 'icon-btn');
            half.textContent = formatarLabel(sub);
            half.dataset.action = 'caps';
            half.addEventListener('click', () => { if (typeof activeMode !== 'undefined' && activeMode !== 'keyboard') return; processarTecla('caps'); resetSelection(); });
            window.__kb_specials[half.id] = half;
            window.__kb_specials_aliases[`key-action-caps`] = half;
            half.setAttribute('data-alias-id', 'key-action-caps');
          } else {
            half.textContent = formatarLabel(sub);
            if (especiais.includes(sub)) half.classList.add('key-special');
            half.dataset.value = (typeof sub === 'string') ? sub : '';
            half.addEventListener('click', () => { if (typeof activeMode !== 'undefined' && activeMode !== 'keyboard') return; processarTecla(sub); resetSelection(); });
          }
        }

        wrapper.appendChild(half);
        halves.push(half);
      });

      container.appendChild(wrapper);
      botoesTeclado.push({
        el: wrapper,
        type: 'compound',
        items: item.items,
        halves,
        occ: 0,
        index
      });
      return;
    }

    const btn = document.createElement('button');

    if (typeof item === 'object' && item.type === 'action') {
      const idKey = item.icon || item.action || `action-${index}`;
      btn.id = `key-action-${idKey}`;
      btn.className = 'icon-btn key-special action-btn';
      if (item.icon) btn.dataset.icon = item.icon;
      if (item.action) btn.dataset.action = item.action;
      btn.innerHTML = getIconHTML(item.icon || '');
      btn.addEventListener('click', () => { if (typeof activeMode !== 'undefined' && activeMode !== 'keyboard') return; processarTecla(item); resetSelection(); });
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
        btn.addEventListener('click', () => { if (typeof activeMode !== 'undefined' && activeMode !== 'keyboard') return; processarTecla('enter'); resetSelection(); });
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
        btn.addEventListener('click', () => { if (typeof activeMode !== 'undefined' && activeMode !== 'keyboard') return; processarTecla(item); resetSelection(); });
        container.appendChild(btn);
        botoesTeclado.push({ el: btn, type: 'simple', value: item, index });
      }
    }
  });

  // space-row (com id/data)
  const spaceRow = document.createElement('button');
  spaceRow.className = 'space-row';
  spaceRow.id = 'key-space';
  spaceRow.dataset.value = 'space';
  spaceRow._item = 'space';
  spaceRow.innerHTML = getIconHTML('spacebar');
  spaceRow.addEventListener('click', () => { if (typeof activeMode !== 'undefined' && activeMode !== 'keyboard') return; processarTecla('space'); resetSelection(); });
  container.appendChild(spaceRow);
  botoesTeclado.push({ el: spaceRow, type: 'space', value: 'space', index: botoesTeclado.length });
  window.__kb_specials[spaceRow.id] = spaceRow;
  window.__kb_specials_aliases[`key-action-space`] = spaceRow;
  spaceRow.setAttribute('data-alias-id', 'key-action-space');

  // limpeza visual inicial
  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if (node && node.classList) node.classList.remove('row-selected', 'selected');
    if (node && node.querySelectorAll) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('row-selected', 'selected'));
  });

  currentRow = 0;
  selectingColumn = false;
}

/* ---------------- criar numpad ---------------- */
function criarNumpad() {
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
    botoesTeclado.push({ el: b, type: 'num', value: numbers[i] });
  }

  const specialWrapper = document.createElement('div');
  specialWrapper.className = 'compound-cell special-wrapper';
  specialWrapper.style.gridColumn = String(numColunas);
  specialWrapper.style.gridRow = '1 / span 2';
  specialWrapper.dataset.rowSpan = '2';

  const specialDefs = [
    { type: 'action', action: 'openTabs', icon: 'gear' },
    { type: 'action', action: 'backspace', icon: 'backspace' },
    { type: 'special', char: 'enter', icon: 'enter' },
    { type: 'action', action: 'clearAll', icon: 'trash' }
  ];

  const halves = [];
  specialDefs.forEach((sd, idx) => {
    const sb = document.createElement('button');
    const idKey = sd.icon || sd.action || sd.char || `sp-${idx}`;
    sb.id = `numpad-action-${idKey}`;
    sb.className = 'half-btn sp-btn key-special action-btn icon-btn';
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

    window.__kb_specials[sb.id] = sb;
    const aliasId = `numpad-action-${sd.icon || sd.action || sd.char || idKey}`;
    window.__kb_specials_aliases[aliasId] = sb;
    sb.setAttribute('data-alias-id', aliasId);

    specialWrapper.appendChild(sb);
    halves.push(sb);
  });

  container.appendChild(specialWrapper);
  botoesTeclado.push({ el: specialWrapper, type: 'special-wrapper', halves, occ: 0 });

  for (let i = 5; i < 10; i++) {
    const b = document.createElement('button');
    b.className = 'num-btn';
    b.id = `num-${numbers[i]}`;
    b.textContent = numbers[i];
    b.dataset.value = numbers[i];
    b._item = numbers[i];
    b.addEventListener('click', () => { if (activeMode !== 'numpad') return; processarTecla(numbers[i]); resetSelection(); });
    container.appendChild(b);
    botoesTeclado.push({ el: b, type: 'num', value: numbers[i] });
  }
  botoesTeclado.push({ el: specialWrapper, type: 'special-wrapper', halves, occ: 1 });

  const spaceRow = document.createElement('button');
  spaceRow.className = 'space-row';
  spaceRow.id = 'numpad-space';
  spaceRow.dataset.value = 'space';
  spaceRow._item = 'space';
  spaceRow.innerHTML = getIconHTML('spacebar');
  spaceRow.addEventListener('click', () => { if (activeMode !== 'numpad') return; processarTecla('space'); resetSelection(); });
  container.appendChild(spaceRow);
  botoesTeclado.push({ el: spaceRow, type: 'space', value: 'space' });

  window.__kb_specials[spaceRow.id] = spaceRow;
  window.__kb_specials_aliases['numpad-action-space'] = spaceRow;
  spaceRow.setAttribute('data-alias-id', 'numpad-action-space');

  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if (node && node.classList) node.classList.remove('row-selected', 'selected');
    if (node && node.querySelectorAll) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('row-selected', 'selected'));
  });

  currentRow = 0;
  selectingColumn = false;
}

/* ---------------- toolbar creation ---------------- */
function criarToolbar() {
  const toolbarRootCandidates = [
    document.getElementById('toolbar-panel'),
    document.getElementById('keyboard-root'),
    document.getElementById('keyboard-panel')
  ];

  let root = null;
  const toolbarPanel = document.getElementById('toolbar-panel');
  if (toolbarPanel) {
    const placeholder = toolbarPanel.querySelector('#toolbar-placeholder');
    if (placeholder) root = placeholder;
    else root = toolbarPanel;
  }

  if (!root) {
    for (let c of toolbarRootCandidates) {
      if (c) { root = c; break; }
    }
  }
  if (!root) return;

  const existing = root.querySelector('.toolbar');
  if (existing) {
    botoesToolbar = Array.from(existing.querySelectorAll('.tool-btn'));
    return;
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const group = document.createElement('div');
  group.className = 'tool-group';

  const buttons = [
    { id: 'tool-select-field', icon: 'target', action: 'selectField' }, // ← NOVO
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
      if (b.action === 'selectField') { // ← NOVO
        mostrarPainelSelecaoCampo();
      } else if (b.action === 'numpad') {
        if (typeof window.setActivePanel === 'function') window.setActivePanel('numpad');
        else setActivePanel('numpad');
      } else if (b.action === 'alpha') {
        if (typeof window.setActivePanel === 'function') window.setActivePanel('keyboard');
        else setActivePanel('keyboard');
      } else if (b.action === 'tools') {
        if (typeof window.setActivePanel === 'function') window.setActivePanel('controls');
        else setActivePanel('controls');
      } else {
        document.dispatchEvent(new CustomEvent('toolbar:action', { detail: { action: b.action } }));
      }
      resetSelection();
    });

    group.appendChild(btn);
  });

  toolbar.appendChild(group);
  root.appendChild(toolbar);

  botoesToolbar = Array.from(toolbar.querySelectorAll('.tool-btn'));
  if (window.__kb_debug) console.log('criarToolbar -> toolbar appended to', root.id || root.tagName);
}

/* ---------------- stopAllTimers ---------------- */
function stopAllTimers() {
  if (rowIntervalId) { clearInterval(rowIntervalId); rowIntervalId = null; }
  if (colIntervalId) { clearInterval(colIntervalId); colIntervalId = null; }
  if (initialTimeoutId) { clearTimeout(initialTimeoutId); initialTimeoutId = null; }

  if (toolbarRowIntervalId) { clearInterval(toolbarRowIntervalId); toolbarRowIntervalId = null; }
  if (toolbarInitialTimeoutId) { clearTimeout(toolbarInitialTimeoutId); toolbarInitialTimeoutId = null; }

  if (controlsRowIntervalId) { clearInterval(controlsRowIntervalId); controlsRowIntervalId = null; }
  if (controlsColIntervalId) { clearInterval(controlsColIntervalId); controlsColIntervalId = null; }
  if (controlsInitialTimeoutId) { clearTimeout(controlsInitialTimeoutId); controlsInitialTimeoutId = null; }

  selectingColumn = false;
  currentSub = 0;
  colRounds = 0;
}

/* ---------------- keyboard row highlight ---------------- */
function highlightRowImmediate() {
  // clear previous visual
  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if (node && node.classList) node.classList.remove('row-selected', 'selected');
    if (node && node.querySelectorAll) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('row-selected', 'selected'));
  });

  const totalRows = Math.max(1, Math.ceil(botoesTeclado.length / numColunas));
  const start = currentRow * numColunas;
  const selectedInfo = [];

  for (let i = start; i < start + numColunas && i < botoesTeclado.length; i++) {
    const entry = botoesTeclado[i];
    const { node, meta, occ } = normalizeEntry(entry);
    if (!node) continue;
    if (node.classList && node.classList.contains('compound-cell')) {
      if (node.classList.contains('special-wrapper')) {
        const halves = Array.from(node.querySelectorAll('.half-btn'));
        const rowSpan = parseInt(node.dataset.rowSpan || '1', 10);
        const halvesPerRow = Math.ceil(halves.length / rowSpan);
        const whichOcc = occ || 0;
        const startHalf = whichOcc * halvesPerRow;
        for (let h = startHalf; h < startHalf + halvesPerRow && h < halves.length; h++) {
          halves[h].classList.add('row-selected');
          selectedInfo.push({ type: 'half', id: halves[h].id || null });
        }
      } else {
        node.classList.add('row-selected');
        node.querySelectorAll('.half-btn').forEach(h => h.classList.add('row-selected'));
        selectedInfo.push({ type: 'wrapper', id: node.id || null });
      }
    } else {
      node.classList.add('row-selected');
      selectedInfo.push({ type: 'node', id: node.id || null, text: node.textContent });
    }
  }

  if (window.__kb_debug) console.log('highlightRowImmediate -> row', currentRow, 'selected entries:', selectedInfo);
  currentRow = (currentRow + 1) % totalRows;
}

/* ---------------- keyboard row cycle ---------------- */
function startRowCycle(withFirstDelay = true) {
  if (activeMode !== 'keyboard' && activeMode !== 'numpad') return;
  stopAllTimers();

  currentRow = 0;
  if (window.__kb_debug) console.log('startRowCycle -> withFirstDelay=', withFirstDelay);

  function doRow() { highlightRowImmediate(); }
  if (withFirstDelay) {
    doRow();
    initialTimeoutId = setTimeout(() => { doRow(); initialTimeoutId = null; rowIntervalId = setInterval(doRow, rowInterval); }, firstRowDelay);
  } else {
    rowIntervalId = setInterval(doRow, rowInterval);
    doRow();
  }
}

/* ---------------- keyboard column cycle ---------------- */
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

  if (window.__kb_debug) console.log('startColumnCycle -> startRow', lastRow, 'startIndex', start);

  function columnTick() {
    // limpa selected anterior
    botoesTeclado.forEach(entry => {
      const { node } = normalizeEntry(entry);
      if (!node) return;
      if (node.classList && node.classList.contains('compound-cell')) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected'));
      else node.classList.remove('selected');
    });

    const idx = start + currentCol;
    if (idx < botoesTeclado.length) {
      const entry = botoesTeclado[idx];
      const { node, meta } = normalizeEntry(entry);
      if (!node) {
        currentCol = (currentCol + 1) % numColunas;
        if (currentCol === 0) colRounds++;
      } else if (node.classList && node.classList.contains('compound-cell')) {
        if (node.classList.contains('special-wrapper')) {
          const halves = Array.from(node.querySelectorAll('.half-btn'));
          const rowSpan = Math.max(1, parseInt(node.dataset.rowSpan || '1', 10));
          const halvesPerRow = Math.ceil(halves.length / rowSpan);
          const whichOcc = (meta && typeof meta.occ === 'number') ? meta.occ : 0;
          const blockStart = whichOcc * halvesPerRow;
          const block = halves.slice(blockStart, blockStart + halvesPerRow);
          if (block.length) {
            const target = block[currentSub % block.length];
            addClassToElement(target, 'selected');
            if (window.__kb_debug) console.log('columnTick -> compound special-wrapper selected', { idx, currentCol, currentSub, targetId: target.id, wrapperId: node.id });
            currentSub++;
            if (currentSub >= block.length) {
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
          const halves = Array.from(node.querySelectorAll('.half-btn'));
          if (halves.length) {
            const target = halves[currentSub % halves.length];
            addClassToElement(target, 'selected');
            if (window.__kb_debug) console.log('columnTick -> compound normal selected', { idx, currentCol, currentSub, targetId: target.id, wrapperId: node.id });
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
        }
      } else {
        addClassToElement(node, 'selected');
        if (window.__kb_debug) console.log('columnTick -> node selected', { idx, currentCol, nodeId: node.id, text: node.textContent });
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

      if (window.__kb_debug) console.log('columnTick -> finished colRounds, returning to row cycle');
      startRowCycle(false);
    }
  }

  columnTick();
  colIntervalId = setInterval(columnTick, rowInterval);
}

/* ---------------- toolbar cycle ---------------- */
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
    toolbarInitialTimeoutId = setTimeout(() => { doRow(); toolbarInitialTimeoutId = null; toolbarRowIntervalId = setInterval(doRow, rowInterval); }, firstRowDelay);
  } else {
    toolbarRowIntervalId = setInterval(doRow, rowInterval);
    doRow();
  }
}

/* ---------------- CONTROLS cycle (linhas + colunas) ---------------- */
let controlsRowIndex = 0;
let controlsColIndex = 0;

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
    controlsInitialTimeoutId = setTimeout(() => { doRow(); controlsInitialTimeoutId = null; controlsRowIntervalId = setInterval(doRow, controlsRowInterval); }, controlsFirstRowDelay);
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

/* ---------------- confirmação / seleção ---------------- */
function selecionarTeclaAtual() {
  // log principal solicitado: toda vez que a piscada acionar a confirmação, aparecerá esse log
  console.log('[BLINK] selecionarTeclaAtual called ->', { activeMode, selectingColumn, currentRow, currentCol, currentSub });

  if (activeMode === 'toolbar') {
    const sel = botoesToolbar.find(b => b.classList.contains('row-selected') || b.classList.contains('selected'));
    if (sel) {
      const action = sel.dataset.action;
      if (action === 'numpad') setActivePanel('numpad');
      else if (action === 'alpha') setActivePanel('keyboard');
      else if (action === 'tools') setActivePanel('controls');
      else document.dispatchEvent(new CustomEvent('toolbar:action:exec', { detail: { action } }));
      resetSelection();
    } else {
      startToolbarCycle();
    }
    return;
  }

  if (activeMode === 'controls') {
    if (!selectingColumn) {
      if (window.__kb_debug) console.log('selecionarTeclaAtual -> entering controls column cycle');
      startControlsColumnCycle();
      return;
    }

    const selBtn = getCurrentlySelectedControlButton();
    if (selBtn) {
      try { selBtn.click(); } catch (e) { /* silencioso */ }
      if (window.__kb_debug) console.log('selecionarTeclaAtual -> controls selected button clicked', selBtn.id || selBtn.textContent);
    } else {
      if (window.__kb_debug) console.log('selecionarTeclaAtual -> no controls selected button found');
    }
    resetSelection();
    return;
  }

  if (!selectingColumn) {
    // checa se a linha atual contem space-row
    const foundSpace = botoesTeclado.find(entry => {
      const { node } = normalizeEntry(entry);
      return node && node.classList && node.classList.contains('row-selected') && node.classList.contains('space-row');
    });
    if (foundSpace) {
      if (window.__kb_debug) console.log('selecionarTeclaAtual -> space-row was row-selected, inserting space');
      processarTecla('space');
      resetSelection();
      return;
    }
    if (window.__kb_debug) console.log('selecionarTeclaAtual -> starting column cycle (first press)');
    startColumnCycle();
    return;
  }

  // se já estamos no modo de seleção de coluna, resolve o item marcado
  const selItem = getCurrentlySelectedItemKeyboard();
  if (window.__kb_debug) console.log('selecionarTeclaAtual -> resolving selItem:', selItem);
  if (selItem !== undefined) {
    if (typeof selItem === 'object' && selItem.type === 'action') processarTecla(selItem);
    else if (typeof selItem === 'object' && selItem.type === 'special' && selItem.char === 'enter') processarTecla('enter');
    else processarTecla(selItem);
  } else {
    if (window.__kb_debug) console.log('selecionarTeclaAtual -> no selItem resolved (undefined)');
  }

  resetSelection();
}

function getCurrentlySelectedItemKeyboard() {
  if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> scanning selected elements...');

  // 1) procura por qualquer .selected
  for (let i = 0; i < botoesTeclado.length; i++) {
    const entry = botoesTeclado[i];
    const { node, meta } = normalizeEntry(entry);
    if (!node) continue;

    if (meta && meta.type === 'special-wrapper') {
      const halves = meta.halves || node.querySelectorAll('.half-btn');
      for (let h = 0; h < halves.length; h++) {
        if (halves[h].classList.contains('selected')) {
          if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> selected special-wrapper half', halves[h].id || halves[h].textContent);
          return halves[h]._numpadAction || halves[h]._item || undefined;
        }
      }
      continue;
    }

    if (meta && meta.type === 'compound') {
      const halves = meta.halves || node.querySelectorAll('.half-btn');
      for (let h = 0; h < halves.length; h++) {
        if (halves[h].classList.contains('selected')) {
          const itm = meta.items && meta.items[h];
          if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> selected compound half', { halfId: halves[h].id, item: itm });
          return itm;
        }
      }
      continue;
    }

    if (node.classList && node.classList.contains('selected')) {
      if (node.classList.contains('space-row')) { if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> selected space-row'); return 'space'; }
      if (node.classList.contains('num-btn')) { if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> selected num-btn', node.textContent); return (meta && meta.value) || node.textContent; }
      if (meta && (meta.type === 'simple' || meta.type === 'special' || meta.type === 'action')) { if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> selected meta', meta); return meta.value || meta.value; }
      if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> selected node text', node.textContent);
      return node.textContent;
    }
  }

  // 2) fallback para row-selected
  for (let i = 0; i < botoesTeclado.length; i++) {
    const entry = botoesTeclado[i];
    const { node, meta } = normalizeEntry(entry);
    if (!node) continue;

    if (meta && meta.type === 'special-wrapper') {
      const halves = meta.halves || node.querySelectorAll('.half-btn');
      for (let h = 0; h < halves.length; h++) {
        if (halves[h].classList.contains('row-selected')) {
          if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> row-selected special-wrapper half', halves[h].id || halves[h].textContent);
          return halves[h]._numpadAction || halves[h]._item || undefined;
        }
      }
      continue;
    }

    if (meta && meta.type === 'compound') {
      const halves = meta.halves || node.querySelectorAll('.half-btn');
      for (let h = 0; h < halves.length; h++) {
        if (halves[h].classList.contains('row-selected')) {
          const itm = meta.items && meta.items[h];
          if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> row-selected compound half', { halfId: halves[h].id, item: itm });
          return itm;
        }
      }
      continue;
    }

    if (node.classList && node.classList.contains('row-selected')) {
      if (node.classList.contains('space-row')) { if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> row-selected space-row'); return 'space'; }
      if (node.classList.contains('num-btn')) { if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> row-selected num-btn', node.textContent); return (meta && meta.value) || node.textContent; }
      if (meta && (meta.type === 'simple' || meta.type === 'special' || meta.type === 'action')) { if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> row-selected meta', meta); return meta.value || meta.value; }
      if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> row-selected node text', node.textContent);
      return node.textContent;
    }
  }

  if (window.__kb_debug) console.log('getCurrentlySelectedItemKeyboard -> no selection found, returning undefined');
  return undefined;
}

/* ---------------- numpad compatibility (confirm) ---------------- */
function selecionarTeclaNumpadAtual() {
  console.log('[BLINK] selecionarTeclaNumpadAtual called ->', { activeMode, selectingColumn });
  if (activeMode !== 'numpad') return;
  if (!selectingColumn) startColumnCycle();
  else selecionarTeclaAtual();
}

/* ---------------- reset / set mode ---------------- */
function resetSelection() {
  stopAllTimers();
  stopToolbarTimers();

  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if (!node) return;
    if (node.classList && node.classList.contains('compound-cell')) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected', 'row-selected'));
    node.classList && node.classList.remove('selected', 'row-selected');
  });

  if (botoesToolbar && botoesToolbar.length) botoesToolbar.forEach(b => b.classList && b.classList.remove('selected', 'row-selected'));

  if (botoesControls && botoesControls.length) clearControlsSelections();

  currentRow = 0;
  currentCol = 0;
  currentSub = 0;
  selectingColumn = false;
  colRounds = 0;

  if (activeMode === 'keyboard' || activeMode === 'numpad') startRowCycle(true);
  else if (activeMode === 'toolbar') startToolbarCycle(true);
  else if (activeMode === 'controls') startControlsRowCycle(true);
}

function setActiveMode(mode) {
  if (mode !== 'keyboard' && mode !== 'numpad' && mode !== 'toolbar' && mode !== 'controls') return;

  stopAllTimers();
  stopToolbarTimers();
  toolbarIndex = 0;
  controlsRowIndex = 0;
  currentRow = 0;

  const panelRoot = document.getElementById('keyboard-panel');
  const kbEl = document.getElementById('keyboard');
  let controlsEl = document.getElementById('controls');
  const toolbarEl = panelRoot ? panelRoot.querySelector('.toolbar') : null;

  if (!controlsEl) controlsEl = ensureControlsPanel();

  activeMode = mode;
  try { window.activeMode = activeMode; } catch (e) { /* silencioso */ }
  if (window.__kb_debug) console.log('setActiveMode -> switching to', mode);

  try {
    if (mode !== 'controls' && controlsEl) blurIfFocusedInside(controlsEl, '.tool-btn, #btn-start');
    if (mode !== 'keyboard' && kbEl) blurIfFocusedInside(kbEl, '.tool-btn, #btn-start');
    if (mode !== 'toolbar' && toolbarEl) blurIfFocusedInside(toolbarEl, '#btn-start, body');
  } catch (e) { /* silencioso */ }

  if (mode === 'keyboard') {
    if (controlsEl) {
      blurIfFocusedInside(controlsEl, '.tool-btn, #btn-start');
      controlsEl.classList.add('hidden');
      controlsEl.style.display = 'none';
      controlsEl.setAttribute('aria-hidden', 'true');
    }
    if (kbEl) {
      kbEl.classList.remove('hidden');
      kbEl.style.display = '';
      kbEl.setAttribute('aria-hidden', 'false');
      criarTeclado();
    }
    if (!toolbarEl) criarToolbar();
  } else if (mode === 'numpad') {
    if (controlsEl) {
      blurIfFocusedInside(controlsEl, '.tool-btn, #btn-start');
      controlsEl.classList.add('hidden');
      controlsEl.style.display = 'none';
      controlsEl.setAttribute('aria-hidden', 'true');
    }
    if (kbEl) {
      kbEl.classList.remove('hidden');
      kbEl.style.display = '';
      kbEl.setAttribute('aria-hidden', 'false');
      criarNumpad();
    }
    if (!toolbarEl) criarToolbar();
  } else if (mode === 'toolbar') {
    if (controlsEl) {
      blurIfFocusedInside(controlsEl, '.tool-btn, #btn-start');
      controlsEl.classList.add('hidden');
      controlsEl.style.display = 'none';
      controlsEl.setAttribute('aria-hidden', 'true');
    }
    criarTeclado();
    criarToolbar();
    if (kbEl) {
      kbEl.classList.remove('hidden');
      kbEl.style.display = '';
      kbEl.setAttribute('aria-hidden', 'false');
    }
  } else if (mode === 'controls') {
    if (kbEl) {
      kbEl.classList.add('hidden');
      kbEl.style.display = 'none';
      kbEl.setAttribute('aria-hidden', 'true');
    }

    let c = document.getElementById('controls');
    if (!c) {
      c = ensureControlsPanel();
    }
    if (!c) {
      console.error('setActiveMode(controls): não foi possível criar #controls (panelRoot missing?)');
    } else {
      c.classList.remove('hidden');
      c.style.display = 'block';
      c.setAttribute('aria-hidden', 'false');

      try { ensureControlsBaseGroups(); } catch (e) { console.warn('ensureControlsBaseGroups error', e); }
      try { ensureControlsRowIntervalButton(); } catch (e) { /* ok */ }
      try { ensureControlsGearButton(); } catch (e) { /* ok */ }
      try { buildControlsModel(); } catch (e) { /* ok */ }

      if (window.__kb_debug) console.log('setActiveMode -> controls shown (forced display:block)');

      try {
        if (window.parent && window.parent !== window) try {
          if (window.parent && window.parent !== window) {
            const h = Math.max(
              document.documentElement.scrollHeight || 0,
              document.body ? (document.body.scrollHeight || 0) : 0
            );
            window.parent.postMessage({ type: 'blink:resize', height: h }, '*');
          }
        } catch (e) { /* silencioso */ }
      } catch (e) { }
    }

    if (!toolbarEl) criarToolbar();
  }

  resetSelection();
}

function setActivePanel(panelName) {
  if (panelName === 'keyboard') setActiveMode('keyboard');
  else if (panelName === 'numpad') setActiveMode('numpad');
  else if (panelName === 'toolbar') setActiveMode('toolbar');
  else if (panelName === 'controls') setActiveMode('controls');
}

/* ---------------- init ---------------- */
async function init() {
  const toPreload = ['backspace', 'gear', 'trash', 'question', 'spacebar', 'enter', 'tools', 'plus', 'forward_tab', 'forward_tab_rev', 'x', '123', 'abc'];
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

  criarToolbar();
  criarTeclado();

  ensureControlsRowIntervalButton();
  ensureControlsGearButton();
  buildControlsModel();

  updateRowIntervalDisplay();

  setActiveMode(activeMode);
}

/* ---------------- Expondo APIs públicas ---------------- */
window.selecionarTeclaAtual = selecionarTeclaAtual;
window.selecionarTeclaNumpadAtual = selecionarTeclaNumpadAtual;
window.resetSelection = resetSelection;
window.toggleCaps = () => { capsAtivo = !capsAtivo; criarTeclado(); };
window.setActivePanel = setActivePanel;
window.setActiveMode = setActiveMode;

document.addEventListener('DOMContentLoaded', () => { init().catch(console.error); });

// delegação simples data-action
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
      const out = document.getElementById('output');
      if (out) out.value = out.value.slice(0, -1);
      resetSelection();
      ev.preventDefault();
      return;
    }
    if (action === 'clearAll') {
      const out = document.getElementById('output');
      if (out) out.value = '';
      resetSelection();
      ev.preventDefault();
      return;
    }
  } catch (err) {
    if (window.__kb_debug) console.warn('delegated data-action handler error', err);
  }
}, true);