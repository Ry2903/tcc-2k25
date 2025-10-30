/* ---------------- CONFIG / ESTADO ---------------- */
const teclas = [
  'A','B','C','D',{ type:'action', action:'backspace', icon:'backspace' },
  { type:'compound', items: ['caps', { type: 'action', action: 'openTabs', icon: 'gear' }] },
  'E','F','G','H','?', { type:'compound', items: ['enter', { type:'action', action: 'clearAll', icon:'trash' }] },
  'I','J','K','L','M','N',
  'O','P','QU','R','S','T',
  'U','V','W','X','Y','Z'
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

/* ---------------- ICON HELPERS ---------------- */
const iconsCache = {};
const PRESERVE_STYLES = new Set(['backspace','trash']);
function wrapIconHTML(svgInner, name, preserve=false){
  const cls = preserve ? 'btn-icon preserve' : 'btn-icon';
  if(name === 'spacebar') return `<span class="${cls} space-icon" aria-hidden="true">${svgInner}</span>`;
  return `<span class="${cls}" aria-hidden="true">${svgInner}</span>`;
}
function iconSVGFallback(name){
  if(name === 'gear') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4z"/></svg>`, name);
  if(name === 'trash') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M6 7h12v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7z"/></svg>`, name, true);
  if(name === 'backspace') return wrapIconHTML(`<svg viewBox="0 0 16 16"><path d="M15.683 3a2 2 0 0 0-2-2h-7.08a2 2 0 0 0-1.519.698L.241 7.35a1 1 0 0 0 0 1.302l4.843 5.65A2 2 0 0 0 6.603 15h7.08a2 2 0 0 0 2-2zM5.829 5.854a.5.5 0 1 1 .707-.708l2.147 2.147 2.146-2.147a.5.5 0 1 1 .707.708L9.39 8l2.146 2.146a.5.5 0 0 1-.707.708L8.683 8.707l-2.147 2.147a.5.5 0 0 1-.707-.708L7.976 8z"/></svg>`, name, true);
  if(name === 'question') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-2h2z"/></svg>`, name);
  if(name === 'spacebar') return wrapIconHTML(`<svg viewBox="0 0 24 24"><rect x="2" y="8" width="20" height="8" rx="2"/></svg>`, name);
  if(name === 'enter' || name === 'return') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M5 12h10l-4-4 1.4-1.4L19 12l-6.6 6.4L10 17l4-4H5z"/></svg>`, name);
  if(name === 'tools') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`, name);
  if(name === 'plus') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg>`, name);
  if(name === 'forward_tab') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M7 7h10v2H7z"/></svg>`, name);
  if(name === 'forward_tab_rev') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M7 7h10v2H7z"/></svg>`, name);
  if(name === 'x') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M6 6l12 12M6 18L18 6"/></svg>`, name);
  if(name === '123' || name === 'abc') return wrapIconHTML(`<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/></svg>`, name);
  return `<span class="btn-icon" aria-hidden="true"></span>`;
}
async function preloadIcon(name){
  if(!name) return;
  if(iconsCache[name]) return;
  try{
    const resp = await fetch(`icons/${name}.svg`);
    if(!resp.ok) throw new Error('SVG not found: ' + name);
    let svg = await resp.text();
    svg = svg.replace(/<\?xml[\s\S]*?\?>/i,'').replace(/<!--[\s\S]*?-->/g,'').replace(/\s(width|height)="[^"]*"/gi,'');
    svg = svg.replace(/<svg([^>]*)>/i, (m, attrs) => {
      if(/preserveAspectRatio=/i.test(attrs)) return `<svg${attrs} width="100%" height="100%">`;
      return `<svg${attrs} preserveAspectRatio="xMidYMid meet" width="100%" height="100%">`;
    });
    if(PRESERVE_STYLES.has(name)){ iconsCache[name] = wrapIconHTML(svg, name, true); return; }
    svg = svg.replace(/(fill|stroke)=['"]([^'"]*)['"]/gi, (m,a,v) => {
      if(/currentColor/i.test(v) || /none/i.test(v)) return `${a}="${v}"`;
      return `${a}="currentColor"`;
    });
    iconsCache[name] = wrapIconHTML(svg, name, false);
  }catch(err){
    iconsCache[name] = iconSVGFallback(name);
  }
}
function getIconHTML(name){
  if(!name) return `<span class="btn-icon" aria-hidden="true"></span>`;
  if(iconsCache[name]) return iconsCache[name];
  const fb = iconSVGFallback(name);
  iconsCache[name] = fb;
  preloadIcon(name).catch(()=>{});
  return fb;
}

/* ---------------- normalize / helpers ---------------- */
function normalizeEntry(entry){
  if(!entry) return { node: null, occ: 0, meta: null };
  if(entry.el) return { node: entry.el, occ: (typeof entry.occ === 'number') ? entry.occ : 0, meta: entry };
  if(entry instanceof Element) return { node: entry, occ: 0, meta: null };
  return { node: null, occ: 0, meta: null };
}
function isElementNode(node){ return node && typeof node === 'object' && node.nodeType === 1; }
function addClassToElement(el, cls){ if(!isElementNode(el)) return; if(!el.classList.contains(cls)) el.classList.add(cls); }
function removeClassFromElement(el, cls){ if(!isElementNode(el)) return; if(el.classList.contains(cls)) el.classList.remove(cls); }

/* ---------------- apply/remove selection classes ---------------- */
function applyClassToEntry(entry, cls, opts = { applyToWrapperIfCompound: true }){
  const { node, occ, meta } = normalizeEntry(entry);
  if(!node || !isElementNode(node)) return;

  if(node.classList.contains('compound-cell')){
    if(node.classList.contains('special-wrapper')){
      const halves = Array.from(node.querySelectorAll('.half-btn'));
      const rowSpan = Math.max(1, parseInt(node.dataset.rowSpan || '1', 10));
      const halvesPerRow = Math.ceil(halves.length / rowSpan);
      if(typeof occ === 'number'){
        const start = occ * halvesPerRow;
        for(let i = start; i < start + halvesPerRow && i < halves.length; i++) addClassToElement(halves[i], cls);
      } else halves.forEach(h => addClassToElement(h, cls));      
      return;
    }    
    node.querySelectorAll('.half-btn').forEach(h => addClassToElement(h, cls));
    if(opts.applyToWrapperIfCompound) addClassToElement(node, cls);
    return;
  }

  addClassToElement(node, cls);
}

function removeClassFromEntry(entry, cls){
  const { node, occ, meta } = normalizeEntry(entry);
  if(!node || !isElementNode(node)) return;

  if(node.classList.contains('compound-cell')){
    if(node.classList.contains('special-wrapper')){
      const halves = Array.from(node.querySelectorAll('.half-btn'));
      const rowSpan = Math.max(1, parseInt(node.dataset.rowSpan || '1', 10));
      const halvesPerRow = Math.ceil(halves.length / rowSpan);
      if(typeof occ === 'number'){
        const start = occ * halvesPerRow;
        for(let i = start; i < start + halvesPerRow && i < halves.length; i++) removeClassFromElement(halves[i], cls);
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
function buildControlsModel(){
  botoesControls = [];
  const groups = Array.from(document.querySelectorAll('#controls .config-group'));
  groups.forEach(group => {
    const btnContainer = group.querySelector('.config-buttons');
    if(!btnContainer) return;
    const buttons = Array.from(btnContainer.querySelectorAll('button'));
    let type = 'single';
    if(buttons.length >= 2) type = 'pair';
    botoesControls.push({ el: btnContainer, buttons, groupEl: group, type });
  });

  ensureControlsGearButton();
  ensureControlsRowIntervalButton();

  const gearBtn = document.getElementById('settings-gear-btn');
  if(gearBtn){
    const wrap = gearBtn.parentElement;
    const groupEl = wrap ? wrap.parentElement : null;
    if(!botoesControls.some(c => c.buttons.some(b => b && b.id === 'settings-gear-btn'))){
      botoesControls.push({ el: wrap, buttons: [gearBtn], groupEl: groupEl, type: 'single' });
    }
  }

  if(window.__kb_debug) console.log('buildControlsModel ->', botoesControls);
}

function ensureControlsGearButton(){
  if(document.getElementById('settings-gear-btn')) return;
  const grid = document.querySelector('#controls .config-grid');
  if(!grid) return;
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
  gearBtn.addEventListener('click', ()=> { setActivePanel('toolbar'); resetSelection(); });
  btnWrap.appendChild(gearBtn);
  group.appendChild(btnWrap);
  grid.appendChild(group);
  if(window.__kb_debug) console.log('ensureControlsGearButton -> created');
}

/* ---------------- Cria botão Intervalo entre linhas ---------------- */
function ensureControlsRowIntervalButton(){
  if(document.getElementById('row-interval-val')) return;
  const grid = document.querySelector('#controls .config-grid');
  if(!grid) return;

  const group = document.createElement('div');
  group.className = 'config-group';

  const label = document.createElement('label');
  label.setAttribute('for','row-interval-val');
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

  // listeners
  const STEP = 100; // ms step
  dec.addEventListener('click', () => {
    rowInterval = Math.max(200, rowInterval - STEP); // limite inferior 200ms
    recalcDerivedIntervals();
    updateRowIntervalDisplay();
    // reinicia ciclos para aplicar novo valor
    resetSelection();
  });
  inc.addEventListener('click', () => {
    rowInterval = Math.min(5000, rowInterval + STEP); // limite superior 5s
    recalcDerivedIntervals();
    updateRowIntervalDisplay();
    resetSelection();
  });

  if(window.__kb_debug) console.log('ensureControlsRowIntervalButton -> created');
}

function updateRowIntervalDisplay(){
  const span = document.getElementById('row-interval-val');
  if(span) span.textContent = `${rowInterval} ms`;
}

function recalcDerivedIntervals(){
  firstRowDelay = rowInterval + 600;
  controlsRowInterval = rowInterval + 900;
  controlsFirstRowDelay = firstRowDelay + 600;
  if(window.__kb_debug) console.log('recalcDerivedIntervals ->', { rowInterval, firstRowDelay, controlsRowInterval, controlsFirstRowDelay });
}

function clearControlsSelections(){
  botoesControls.forEach(entry => {
    try {
      if(entry.el) entry.el.classList.remove('row-selected','selected');
      if(Array.isArray(entry.buttons)) entry.buttons.forEach(b => { if(b && b.classList) b.classList.remove('row-selected','selected'); });
      if(entry.groupEl) entry.groupEl.classList.remove('row-selected','selected');
    } catch(e){}
  });
}

function getCurrentlySelectedControlButton(){
  for(let i=0;i<botoesControls.length;i++){
    const entry = botoesControls[i];
    if(!entry) continue;
    if(entry.buttons && entry.buttons.length){
      for(let j=0;j<entry.buttons.length;j++){
        const b = entry.buttons[j];
        if(b && b.classList && b.classList.contains('selected')) return b;
      }
    }
    if(entry.el && entry.el.classList.contains('row-selected') && entry.buttons && entry.buttons.length === 1){
      return entry.buttons[0];
    }
  }
  return undefined;
}

/* ---------------- formatting / processing ---------------- */
const especiais = ['caps','?','enter'];
function formatarLabel(item){
  if(typeof item === 'string'){
    if(especiais.includes(item)) return item;
    return capsAtivo ? item.toUpperCase() : item.toLowerCase();
  }
  return null;
}

function processarTecla(item){
  const out = document.getElementById('output');
  if(!out) return;

  if(typeof item === 'object' && item.type === 'action'){
    if(item.action === 'clearAll'){ out.value = ''; return; }
    if(item.action === 'openTabs'){ setActivePanel('toolbar'); return; }
    if(item.action === 'backspace'){ out.value = out.value.slice(0,-1); return; }
    return;
  }

  if(item === 'caps'){ capsAtivo = !capsAtivo; criarTeclado(); return; }
  if(item === 'enter'){ document.dispatchEvent(new CustomEvent('keyboard:enter', { detail: { value: out.value }})); return; }
  if(item === 'space'){ out.value += ' '; return; }

  out.value += formatarLabel(item);
}

/* ---------------- DOM helpers ---------------- */
function getKeyboardContainer(){
  let kb = document.getElementById('keyboard');
  if(kb) return kb;
  const panelRoot = document.getElementById('keyboard-panel');
  if(!panelRoot) return null;
  kb = document.createElement('div');
  kb.id = 'keyboard';
  kb.className = 'grid-6cols';
  panelRoot.appendChild(kb);
  return kb;
}

/* ---------------- criar teclado ---------------- */
function criarTeclado(){
  const container = getKeyboardContainer();
  if(!container) return;
  container.innerHTML = '';
  botoesTeclado = [];

  container.className = 'grid-6cols';
  container.setAttribute('data-mode','keyboard');

  teclas.forEach(item => {
    if(typeof item === 'object' && item.type === 'compound'){
      const wrapper = document.createElement('div');
      wrapper.className = 'compound-cell';
      const halves = [];
      item.items.forEach(sub => {
        const half = document.createElement('button');
        half.className = 'half-btn';
        if(typeof sub === 'object' && sub.type === 'action'){
          half.innerHTML = getIconHTML(sub.icon || '');
          half.classList.add('key-special');
          half.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla(sub); resetSelection(); });
        } else {
          if(sub === 'enter'){
            half.innerHTML = getIconHTML('enter');
            half.classList.add('key-special');
            half.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla('enter'); resetSelection(); });
          } else {
            half.textContent = formatarLabel(sub);
            if(especiais.includes(sub)) half.classList.add('key-special');
            half.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla(sub); resetSelection(); });
          }
        }
        wrapper.appendChild(half);
        halves.push(half);
      });
      container.appendChild(wrapper);
      botoesTeclado.push({ el: wrapper, type: 'compound', items: item.items, halves });
      return;
    }

    const btn = document.createElement('button');
    if(typeof item === 'object' && item.type === 'action'){
      btn.className = 'icon-btn key-special';
      btn.innerHTML = getIconHTML(item.icon || '');
      btn.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla(item); resetSelection(); });
      container.appendChild(btn);
      botoesTeclado.push({ el: btn, type: 'action', value: item });
    } else {
      if(item === 'enter'){
        btn.innerHTML = getIconHTML('enter');
        btn.classList.add('key-special');
        btn.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla('enter'); resetSelection(); });
        container.appendChild(btn);
        botoesTeclado.push({ el: btn, type: 'special', value: 'enter' });
      } else {
        btn.textContent = formatarLabel(item);
        if(especiais.includes(item)) btn.classList.add('key-special');
        btn.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla(item); resetSelection(); });
        container.appendChild(btn);
        botoesTeclado.push({ el: btn, type: 'simple', value: item });
      }
    }
  });

  const spaceRow = document.createElement('button');
  spaceRow.className = 'space-row';
  spaceRow._item = 'space';
  spaceRow.innerHTML = getIconHTML('spacebar');
  spaceRow.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla('space'); resetSelection(); });
  container.appendChild(spaceRow);
  botoesTeclado.push({ el: spaceRow, type: 'space', value: 'space' });

  // limpeza visual inicial
  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if(node && node.classList) node.classList.remove('row-selected','selected');
    if(node && node.querySelectorAll) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('row-selected','selected'));
  });

  currentRow = 0;
  selectingColumn = false;
}

/* ---------------- criar numpad ---------------- */
function criarNumpad(){
  const container = getKeyboardContainer();
  if(!container) return;
  container.innerHTML = '';
  botoesTeclado = [];

  container.className = 'grid-6cols';
  container.setAttribute('data-mode','numpad');

  const numbers = ['1','2','3','4','5','6','7','8','9','0'];

  for(let i=0;i<5;i++){
    const b = document.createElement('button');
    b.className = 'num-btn';
    b.textContent = numbers[i];
    b._item = numbers[i];
    b.addEventListener('click', ()=>{ if(activeMode!=='numpad') return; processarTecla(numbers[i]); resetSelection(); });
    container.appendChild(b);
    botoesTeclado.push({ el: b, type: 'num', value: numbers[i] });
  }

  const specialWrapper = document.createElement('div');
  specialWrapper.className = 'compound-cell special-wrapper';
  specialWrapper.style.gridColumn = String(numColunas);
  specialWrapper.style.gridRow = '1 / span 2';
  specialWrapper.dataset.rowSpan = '2';

  const specialDefs = [
    { type:'action', action:'openTabs', icon:'gear' },
    { type:'action', action:'backspace', icon:'backspace' },
    { type:'special', char:'enter', icon:'enter' },
    { type:'action', action:'clearAll', icon:'trash' }
  ];

  const halves = [];
  specialDefs.forEach(sd => {
    const sb = document.createElement('button');
    sb.className = 'half-btn sp-btn key-special';
    sb._numpadAction = sd;
    sb.innerHTML = getIconHTML(sd.icon || '');
    sb.addEventListener('click', ()=>{ if(activeMode!=='numpad') return;
      if(sd.type === 'action') processarTecla(sd);
      else if(sd.type === 'special' && sd.char === 'enter') processarTecla('enter');
      resetSelection();
    });
    specialWrapper.appendChild(sb);
    halves.push(sb);
  });

  container.appendChild(specialWrapper);
  botoesTeclado.push({ el: specialWrapper, type: 'special-wrapper', halves, occ: 0 });
  for(let i=5;i<10;i++){
    const b = document.createElement('button');
    b.className = 'num-btn';
    b.textContent = numbers[i];
    b._item = numbers[i];
    b.addEventListener('click', ()=>{ if(activeMode!=='numpad') return; processarTecla(numbers[i]); resetSelection(); });
    container.appendChild(b);
    botoesTeclado.push({ el: b, type: 'num', value: numbers[i] });
  }
  botoesTeclado.push({ el: specialWrapper, type: 'special-wrapper', halves, occ: 1 });

  const spaceRow = document.createElement('button');
  spaceRow.className = 'space-row';
  spaceRow._item = 'space';
  spaceRow.innerHTML = getIconHTML('spacebar');
  spaceRow.addEventListener('click', ()=>{ if(activeMode!=='numpad') return; processarTecla('space'); resetSelection(); });
  container.appendChild(spaceRow);
  botoesTeclado.push({ el: spaceRow, type: 'space', value: 'space' });

  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if(node && node.classList) node.classList.remove('row-selected','selected');
    if(node && node.querySelectorAll) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('row-selected','selected'));
  });

  currentRow = 0;
  selectingColumn = false;
}

/* ---------------- toolbar creation ---------------- */
function criarToolbar(){
  const root = document.getElementById('keyboard-root') || document.getElementById('keyboard-panel');
  if(!root) return;

  const existing = root.querySelector('.toolbar');
  if(existing){
    botoesToolbar = Array.from(existing.querySelectorAll('.tool-btn'));
    return;
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const group = document.createElement('div');
  group.className = 'tool-group';

  const buttons = [
    { id:'tool-tools', icon:'tools', action:'tools' },
    { id:'tool-plus',  icon:'plus', action:'plus' },
    { id:'tool-back',  icon:'forward_tab_rev', action:'back' },
    { id:'tool-fwd',   icon:'forward_tab', action:'forward' },
    { id:'tool-x',     icon:'x', action:'x' },
    { id:'tool-123',   icon:'123', action:'numpad' },
    { id:'tool-abc',   icon:'abc', action:'alpha' }
  ];

  buttons.forEach(b=>{
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.id = b.id;
    btn.innerHTML = getIconHTML(b.icon);
    btn.dataset.action = b.action;
    btn.addEventListener('click', () => {
      if(b.action === 'numpad') setActivePanel('numpad');
      else if(b.action === 'alpha') setActivePanel('keyboard');
      else if(b.action === 'tools') setActivePanel('controls');
      else document.dispatchEvent(new CustomEvent('toolbar:action', { detail: { action: b.action } }));
      resetSelection();
    });
    group.appendChild(btn);
  });

  toolbar.appendChild(group);
  const kb = document.getElementById('keyboard');
  if(kb && kb.parentNode) kb.parentNode.insertBefore(toolbar, kb);
  else root.insertBefore(toolbar, root.firstChild);
  botoesToolbar = Array.from(toolbar.querySelectorAll('.tool-btn'));
}

/* ---------------- stopAllTimers ---------------- */
function stopAllTimers(){
  if(rowIntervalId){ clearInterval(rowIntervalId); rowIntervalId = null; }
  if(colIntervalId){ clearInterval(colIntervalId); colIntervalId = null; }
  if(initialTimeoutId){ clearTimeout(initialTimeoutId); initialTimeoutId = null; }

  if(toolbarRowIntervalId){ clearInterval(toolbarRowIntervalId); toolbarRowIntervalId = null; }
  if(toolbarInitialTimeoutId){ clearTimeout(toolbarInitialTimeoutId); toolbarInitialTimeoutId = null; }

  if(controlsRowIntervalId){ clearInterval(controlsRowIntervalId); controlsRowIntervalId = null; }
  if(controlsColIntervalId){ clearInterval(controlsColIntervalId); controlsColIntervalId = null; }
  if(controlsInitialTimeoutId){ clearTimeout(controlsInitialTimeoutId); controlsInitialTimeoutId = null; }

  selectingColumn = false;
  currentSub = 0;
  colRounds = 0;
}

/* ---------------- keyboard row highlight ---------------- */
function highlightRowImmediate(){
  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if(node && node.classList) node.classList.remove('row-selected','selected');
    if(node && node.querySelectorAll) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('row-selected','selected'));
  });

  const totalRows = Math.max(1, Math.ceil(botoesTeclado.length / numColunas));
  const start = currentRow * numColunas;

  for(let i = start; i < start + numColunas && i < botoesTeclado.length; i++){
    const entry = botoesTeclado[i];
    const { node, meta, occ } = normalizeEntry(entry);
    if(!node) continue;
    // se for compound ou special-wrapper trata as metades
    if(node.classList && node.classList.contains('compound-cell')){
      if(node.classList.contains('special-wrapper')){
        const halves = Array.from(node.querySelectorAll('.half-btn'));
        const rowSpan = parseInt(node.dataset.rowSpan || '1', 10);
        const halvesPerRow = Math.ceil(halves.length / rowSpan);
        const whichOcc = occ || 0;
        const startHalf = whichOcc * halvesPerRow;
        for(let h = startHalf; h < startHalf + halvesPerRow && h < halves.length; h++){
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

/* ---------------- keyboard row cycle ---------------- */
function startRowCycle(withFirstDelay = true){
  if(activeMode !== 'keyboard' && activeMode !== 'numpad') return;
  stopAllTimers();

  // garantir que comece pela primeira linha quando entrar no mode
  currentRow = 0;

  function doRow(){ highlightRowImmediate(); }
  if(withFirstDelay){
    doRow();
    initialTimeoutId = setTimeout(()=>{ doRow(); initialTimeoutId = null; rowIntervalId = setInterval(doRow, rowInterval); }, firstRowDelay);
  } else {
    rowIntervalId = setInterval(doRow, rowInterval);
    doRow();
  }
}

/* ---------------- keyboard column cycle ---------------- */
function startColumnCycle(){
  if(rowIntervalId){ clearInterval(rowIntervalId); rowIntervalId = null; }
  if(initialTimeoutId){ clearTimeout(initialTimeoutId); initialTimeoutId = null; }

  selectingColumn = true;
  colRounds = 0;
  currentCol = 0;
  currentSub = 0;

  const totalRows = Math.max(1, Math.ceil(botoesTeclado.length / numColunas));
  const lastRow = (currentRow - 1 + totalRows) % totalRows;
  const start = lastRow * numColunas;

  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if(!node) return;
    if(node.classList && node.classList.contains('compound-cell')) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected'));
    node.classList && node.classList.remove('selected');
  });

  function columnTick(){
    // limpa somente selected
    botoesTeclado.forEach(entry => {
      const { node } = normalizeEntry(entry);
      if(!node) return;
      if(node.classList && node.classList.contains('compound-cell')) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected'));
      else node.classList.remove('selected');
    });

    const idx = start + currentCol;

    if(idx < botoesTeclado.length){
      const entry = botoesTeclado[idx];
      const { node, meta } = normalizeEntry(entry);
      if(!node){
        currentCol = (currentCol + 1) % numColunas;
        if(currentCol === 0) colRounds++;
      } else if(node.classList && node.classList.contains('compound-cell')){
        // compound-cell: se special-wrapper (com occ) -> seleciona apenas o bloco de metades correspondente
        if(node.classList.contains('special-wrapper')){
          const halves = Array.from(node.querySelectorAll('.half-btn'));
          const rowSpan = Math.max(1, parseInt(node.dataset.rowSpan || '1', 10));
          const halvesPerRow = Math.ceil(halves.length / rowSpan);
          const whichOcc = (meta && typeof meta.occ === 'number') ? meta.occ : 0;
          const blockStart = whichOcc * halvesPerRow;
          const block = halves.slice(blockStart, blockStart + halvesPerRow);
          if(block.length){
            const target = block[currentSub % block.length];
            addClassToElement(target, 'selected');
            currentSub++;
            if(currentSub >= block.length){
              currentSub = 0;
              currentCol = (currentCol + 1) % numColunas;
              if(currentCol === 0) colRounds++;
            }
          } else {
            addClassToElement(node, 'selected');
            currentCol = (currentCol + 1) % numColunas;
            if(currentCol === 0) colRounds++;
          }
        } else {
          // compound normal: itera as metades
          const halves = Array.from(node.querySelectorAll('.half-btn'));
          if(halves.length){
            const target = halves[currentSub % halves.length];
            addClassToElement(target, 'selected');
            currentSub++;
            if(currentSub >= halves.length){
              currentSub = 0;
              currentCol = (currentCol + 1) % numColunas;
              if(currentCol === 0) colRounds++;
            }
          } else {
            addClassToElement(node, 'selected');
            currentCol = (currentCol + 1) % numColunas;
            if(currentCol === 0) colRounds++;
          }
        }
      } else {
        addClassToElement(node, 'selected');
        currentCol = (currentCol + 1) % numColunas;
        if(currentCol === 0) colRounds++;
      }
    } else {
      currentCol = (currentCol + 1) % numColunas;
      if(currentCol === 0) colRounds++;
    }

    if(colRounds >= COL_ROUNDS_MAX){
      clearInterval(colIntervalId);
      colIntervalId = null;
      selectingColumn = false;

      botoesTeclado.forEach(entry => {
        const { node } = normalizeEntry(entry);
        if(!node) return;
        if(node.classList && node.classList.contains('compound-cell')) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected'));
        node.classList && node.classList.remove('selected');
      });

      // volta ao ciclo de linhas
      startRowCycle(false);
    }
  }

  // tick imediato + intervalo
  columnTick();
  colIntervalId = setInterval(columnTick, rowInterval);
}

/* ---------------- toolbar cycle ---------------- */
function stopToolbarTimers(){
  if(toolbarRowIntervalId){ clearInterval(toolbarRowIntervalId); toolbarRowIntervalId = null; }
  if(toolbarInitialTimeoutId){ clearTimeout(toolbarInitialTimeoutId); toolbarInitialTimeoutId = null; }
  botoesToolbar.forEach(b => b.classList.remove('selected','row-selected'));
}
function startToolbarCycle(withFirstDelay = true){
  stopToolbarTimers();

  // sempre começa do primeiro botão
  toolbarIndex = 0;

  if(!botoesToolbar || !botoesToolbar.length){
    const anyToolbar = document.querySelector('.toolbar');
    if(anyToolbar) botoesToolbar = Array.from(anyToolbar.querySelectorAll('.tool-btn'));
  }
  if(!botoesToolbar || !botoesToolbar.length) return;

  function doRow(){
    botoesToolbar.forEach(b => b.classList.remove('row-selected'));
    const idx = toolbarIndex % botoesToolbar.length;
    botoesToolbar[idx].classList.add('row-selected');
    toolbarIndex = (toolbarIndex + 1) % botoesToolbar.length;
  }

  if(withFirstDelay){
    doRow();
    toolbarInitialTimeoutId = setTimeout(()=>{ doRow(); toolbarInitialTimeoutId = null; toolbarRowIntervalId = setInterval(doRow, rowInterval); }, firstRowDelay);
  } else {
    toolbarRowIntervalId = setInterval(doRow, rowInterval);
    doRow();
  }
}

/* ---------------- CONTROLS cycle (linhas + colunas) ---------------- */
let controlsRowIndex = 0;
let controlsColIndex = 0;

function highlightControlsRowImmediate(){
  clearControlsSelections();
  if(!botoesControls || !botoesControls.length) return;
  const totalRows = botoesControls.length;
  const idx = controlsRowIndex % totalRows;
  const entry = botoesControls[idx];
  if(!entry) return;
  if(entry.el && entry.el.classList) entry.el.classList.add('row-selected');
  if(entry.groupEl && entry.groupEl.classList) entry.groupEl.classList.add('row-selected');
  controlsRowIndex = (controlsRowIndex + 1) % totalRows;
}

function startControlsRowCycle(withFirstDelay = true){
  if(activeMode !== 'controls') return;
  stopAllTimers();
  buildControlsModel();

  controlsRowIndex = 0;

  function doRow(){ highlightControlsRowImmediate(); }
  if(withFirstDelay){
    doRow();
    controlsInitialTimeoutId = setTimeout(()=>{ doRow(); controlsInitialTimeoutId = null; controlsRowIntervalId = setInterval(doRow, controlsRowInterval); }, controlsFirstRowDelay);
  } else {
    controlsRowIntervalId = setInterval(()=>{ highlightControlsRowImmediate(); }, controlsRowInterval);
    doRow();
  }
}

function startControlsColumnCycle(){
  if(controlsRowIntervalId){ clearInterval(controlsRowIntervalId); controlsRowIntervalId = null; }
  if(controlsInitialTimeoutId){ clearTimeout(controlsInitialTimeoutId); controlsInitialTimeoutId = null; }

  selectingColumn = true;
  controlsColIndex = 0;
  colRounds = 0;

  const total = Math.max(1, botoesControls.length);
  const lastRow = (controlsRowIndex - 1 + total) % total;
  const entry = botoesControls[lastRow];
  if(!entry) {
    selectingColumn = false;
    startControlsRowCycle(false);
    return;
  }

  // prepara: mantém row-selected no entry atual
  clearControlsSelections();
  if(entry.el && entry.el.classList) entry.el.classList.add('row-selected');
  if(entry.groupEl && entry.groupEl.classList) entry.groupEl.classList.add('row-selected');

  function columnTick(){
    // remove apenas 'selected' (mantendo row-selected)
    botoesControls.forEach(e => {
      if(e.buttons && e.buttons.length) e.buttons.forEach(b => b.classList.remove('selected'));
    });

    const buttons = entry.buttons || [];
    if(buttons.length === 0){
      if(entry.el) entry.el.classList.add('selected');
      colRounds++;
    } else {
      const idx = controlsColIndex % buttons.length;
      const target = buttons[idx];
      if(target) target.classList.add('selected');
      controlsColIndex = (controlsColIndex + 1) % buttons.length;
      if(controlsColIndex === 0) colRounds++;
    }

    if(colRounds >= COL_ROUNDS_MAX){
      if(controlsColIntervalId){ clearInterval(controlsColIntervalId); controlsColIntervalId = null; }
      selectingColumn = false;
      botoesControls.forEach(e => {
        if(e.buttons && e.buttons.length) e.buttons.forEach(b => b.classList.remove('selected'));
      });
      startControlsRowCycle(false);
    }
  }

  columnTick();
  controlsColIntervalId = setInterval(columnTick, controlsRowInterval);
}

/* ---------------- confirmação / seleção ---------------- */
function selecionarTeclaAtual(){
  if(activeMode === 'toolbar'){
    const sel = botoesToolbar.find(b => b.classList.contains('row-selected') || b.classList.contains('selected'));
    if(sel){
      const action = sel.dataset.action;
      if(action === 'numpad') setActivePanel('numpad');
      else if(action === 'alpha') setActivePanel('keyboard');
      else if(action === 'tools') setActivePanel('controls');
      else document.dispatchEvent(new CustomEvent('toolbar:action:exec', { detail: { action } }));
      resetSelection();
    } else {
      startToolbarCycle();
    }
    return;
  }

  if(activeMode === 'controls'){
    if(!selectingColumn){
      startControlsColumnCycle();
      return;
    }

    const selBtn = getCurrentlySelectedControlButton();
    if(selBtn){
      try { selBtn.click(); } catch(e){ /* silencioso */ }
    }
    resetSelection();
    return;
  }

  if(!selectingColumn){
    // se a linha contém space-row, trata como espaço e finaliza
    const foundSpace = botoesTeclado.find(entry => {
      const { node } = normalizeEntry(entry);
      return node && node.classList && node.classList.contains('row-selected') && node.classList.contains('space-row');
    });
    if(foundSpace){
      processarTecla('space');
      resetSelection();
      return;
    }
    startColumnCycle();
    return;
  }

  // já em seleção de coluna: resolve o item selecionado via meta
  const selItem = getCurrentlySelectedItemKeyboard();
  if(selItem !== undefined){
    if(typeof selItem === 'object' && selItem.type === 'action') processarTecla(selItem);
    else if(typeof selItem === 'object' && selItem.type === 'special' && selItem.char === 'enter') processarTecla('enter');
    else processarTecla(selItem);
  }

  resetSelection();
}

function getCurrentlySelectedItemKeyboard(){
  // 1) Procura *primeiro* por qualquer elemento marcado como 'selected'
  for(let i=0;i<botoesTeclado.length;i++){
    const entry = botoesTeclado[i];
    const { node, meta } = normalizeEntry(entry);
    if(!node) continue;

    // special-wrapper (numpad): procura halves com class 'selected'
    if(meta && meta.type === 'special-wrapper'){
      const halves = meta.halves || node.querySelectorAll('.half-btn');
      for(let h=0; h<halves.length; h++){
        if(halves[h].classList.contains('selected')) return halves[h]._numpadAction || halves[h]._item || undefined;
      }
      continue;
    }

    // compound normal: procura halves selected
    if(meta && meta.type === 'compound'){
      const halves = meta.halves || node.querySelectorAll('.half-btn');
      for(let h=0; h<halves.length; h++){
        if(halves[h].classList.contains('selected')) {
          const itm = meta.items && meta.items[h];
          return itm;
        }
      }
      continue;
    }

    // simples / num / space / action / special: se o próprio node estiver 'selected'
    if(node.classList && node.classList.contains('selected')){
      if(node.classList.contains('space-row')) return 'space';
      if(node.classList.contains('num-btn')) return (meta && meta.value) || node.textContent;
      if(meta && (meta.type === 'simple' || meta.type === 'special' || meta.type === 'action')) return meta.value || meta.value;
      return node.textContent;
    }
  }

  // 2) Se não houver .selected em nenhum lugar, faz fallback para row-selected
  for(let i=0;i<botoesTeclado.length;i++){
    const entry = botoesTeclado[i];
    const { node, meta } = normalizeEntry(entry);
    if(!node) continue;

    if(meta && meta.type === 'special-wrapper'){
      const halves = meta.halves || node.querySelectorAll('.half-btn');
      for(let h=0; h<halves.length; h++){
        if(halves[h].classList.contains('row-selected')) return halves[h]._numpadAction || halves[h]._item || undefined;
      }
      continue;
    }

    if(meta && meta.type === 'compound'){
      const halves = meta.halves || node.querySelectorAll('.half-btn');
      for(let h=0; h<halves.length; h++){
        if(halves[h].classList.contains('row-selected')) {
          const itm = meta.items && meta.items[h];
          return itm;
        }
      }
      // se wrapper está row-selected (sem metades selecionadas), não dá pra saber a coluna - deixa undefined
      continue;
    }

    if(node.classList && node.classList.contains('row-selected')){
      if(node.classList.contains('space-row')) return 'space';
      if(node.classList.contains('num-btn')) return (meta && meta.value) || node.textContent;
      if(meta && (meta.type === 'simple' || meta.type === 'special' || meta.type === 'action')) return meta.value || meta.value;
      return node.textContent;
    }
  }

  return undefined;
}

/* ---------------- numpad compatibility (confirm) ---------------- */
function selecionarTeclaNumpadAtual(){
  if(activeMode !== 'numpad') return;
  if(!selectingColumn) startColumnCycle();
  else selecionarTeclaAtual();
}

/* ---------------- reset / set mode ---------------- */
function resetSelection(){
  stopAllTimers();
  stopToolbarTimers();

  botoesTeclado.forEach(entry => {
    const { node } = normalizeEntry(entry);
    if(!node) return;
    if(node.classList && node.classList.contains('compound-cell')) node.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected','row-selected'));
    node.classList && node.classList.remove('selected','row-selected');
  });

  if(botoesToolbar && botoesToolbar.length) botoesToolbar.forEach(b => b.classList && b.classList.remove('selected','row-selected'));

  if(botoesControls && botoesControls.length) clearControlsSelections();

  currentRow = 0;
  currentCol = 0;
  currentSub = 0;
  selectingColumn = false;
  colRounds = 0;

  if(activeMode === 'keyboard' || activeMode === 'numpad') startRowCycle(true);
  else if(activeMode === 'toolbar') startToolbarCycle(true);
  else if(activeMode === 'controls') startControlsRowCycle(true);
}

function setActiveMode(mode){
  if(mode !== 'keyboard' && mode !== 'numpad' && mode !== 'toolbar' && mode !== 'controls') return;

  // reseta timers/índices para garantir que o ciclo comece sempre do início
  stopAllTimers();
  stopToolbarTimers();
  toolbarIndex = 0;
  controlsRowIndex = 0;
  currentRow = 0;

  activeMode = mode;
  if(mode === 'keyboard') criarTeclado();
  else if(mode === 'numpad') criarNumpad();
  else if(mode === 'toolbar'){ criarTeclado(); criarToolbar(); }
  else if(mode === 'controls'){
    criarTeclado(); // manter layout, foco ficará nos controls
    buildControlsModel();
  }

  // reinicia o ciclo apropriado
  resetSelection();
}

function setActivePanel(panelName){
  if(panelName === 'keyboard') setActiveMode('keyboard');
  else if(panelName === 'numpad') setActiveMode('numpad');
  else if(panelName === 'toolbar') setActiveMode('toolbar');
  else if(panelName === 'controls') setActiveMode('controls');
}

/* ---------------- init ---------------- */
async function init(){
  const toPreload = ['backspace','gear','trash','question','spacebar','enter','tools','plus','forward_tab','forward_tab_rev','x','123','abc'];
  await Promise.all(toPreload.map(n => preloadIcon(n).catch(()=>{})));

  const kp = document.getElementById('keyboard-panel');
  if(kp){
    let kb = document.getElementById('keyboard');
    if(!kb){
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

window.selecionarTeclaAtual = selecionarTeclaAtual;
window.selecionarTeclaNumpadAtual = selecionarTeclaNumpadAtual;
window.resetSelection = resetSelection;
window.toggleCaps = ()=> { capsAtivo = !capsAtivo; criarTeclado(); };

document.addEventListener('DOMContentLoaded', ()=> { init().catch(console.error); });