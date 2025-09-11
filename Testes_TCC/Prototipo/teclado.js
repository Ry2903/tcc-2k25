const teclas = [
  'A','B','C','D',{ type:'action', action:'backspace', icon:'backspace' },
  { type:'compound', items: ['caps', { type: 'action', action: 'openTabs', icon: 'gear' }] },
  'E','F','G','H','?', { type:'compound', items: ['–', { type:'action', action: 'clearAll', icon:'trash' }] },
  'I','J','K','L','M','N',
  'O','P','QU','R','S','T',
  'U','V','W','X','Y','Z'
];

let capsAtivo = false;
let botoesTeclado = []; // referencia linear dos elementos atualmente exibidos no #keyboard
let botoesToolbar = [];
let activeMode = 'keyboard'; // 'keyboard' | 'numpad' | 'toolbar'

const numColunas = 6;
const ROW_INTERVAL = 900;
const FIRST_ROW_DELAY = 1800;
const COL_ROUNDS_MAX = 3;

let rowIntervalId = null;
let colIntervalId = null;
let initialTimeoutId = null;

let currentRow = 0;
let currentCol = 0;
let currentSub = 0;
let colRounds = 0;
let selectingColumn = false;

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
  if(name === 'enter') return wrapIconHTML(`<svg viewBox="0 0 24 24"><path d="M5 12h10l-4-4 1.4-1.4L19 12l-6.6 6.4L10 17l4-4H5z"/></svg>`, name);
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
  // preload in background
  preloadIcon(name).catch(()=>{});
  return fb;
}

/* ---------------- formatting / behavior ---------------- */
const especiais = ['caps','?','–'];

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
  // action object
  if(typeof item === 'object' && item.type === 'action'){
    if(item.action === 'clearAll'){ out.value = ''; return; }
    if(item.action === 'openTabs'){ document.dispatchEvent(new CustomEvent('keyboard:openTabs')); return; }
    if(item.action === 'backspace'){ out.value = out.value.slice(0,-1); return; }
    return;
  }
  if(item === 'caps'){ capsAtivo = !capsAtivo; criarTeclado(); return; }
  if(item === 'enter'){ document.dispatchEvent(new CustomEvent('keyboard:enter', { detail: { value: out.value }})); return; }
  if(item === 'space'){ out.value += ' '; return; }
  out.value += formatarLabel(item);
}

/* ---------------- build ABC keyboard ---------------- */
function criarTeclado(){
  const container = document.getElementById('keyboard');
  if(!container) return;
  container.innerHTML = '';
  botoesTeclado = [];

  // build keys from teclas[]
  teclas.forEach(item => {
    if(typeof item === 'object' && item.type === 'compound'){
      const wrapper = document.createElement('div');
      wrapper.className = 'compound-cell';
      item.items.forEach(sub => {
        const half = document.createElement('button');
        half.className = 'half-btn';
        if(typeof sub === 'object' && sub.type === 'action'){
          half.innerHTML = getIconHTML(sub.icon || '');
          half.classList.add('key-special');
          half.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla(sub); resetSelection(); });
        } else {
          if(sub === '–'){
            half.innerHTML = getIconHTML('spacebar');
            half.classList.add('key-special');
            half.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla('space'); resetSelection(); });
          } else {
            half.textContent = formatarLabel(sub);
            if(especiais.includes(sub)) half.classList.add('key-special');
            half.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla(sub); resetSelection(); });
          }
        }
        wrapper.appendChild(half);
      });
      container.appendChild(wrapper);
      botoesTeclado.push(wrapper);
      return;
    }

    const btn = document.createElement('button');
    if(typeof item === 'object' && item.type === 'action'){
      btn.className = 'icon-btn key-special';
      btn.innerHTML = getIconHTML(item.icon || '');
      btn.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla(item); resetSelection(); });
    } else {
      if(item === '–'){
        btn.innerHTML = getIconHTML('spacebar');
        btn.classList.add('key-special');
        btn.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla('space'); resetSelection(); });
      } else {
        btn.textContent = formatarLabel(item);
        if(especiais.includes(item)) btn.classList.add('key-special');
      }
      btn.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla(item); resetSelection(); });
    }
    container.appendChild(btn);
    botoesTeclado.push(btn);
  });

  // append space-row at bottom (full width)
  const spaceRow = document.createElement('button');
  spaceRow.className = 'space-row';
  spaceRow.innerHTML = getIconHTML('spacebar');
  spaceRow.addEventListener('click', ()=>{ if(activeMode!=='keyboard') return; processarTecla('space'); resetSelection(); });
  container.appendChild(spaceRow);

  // set data-mode attribute
  container.setAttribute('data-mode','keyboard');

  // clear visual flags
  botoesTeclado.forEach(el => { if(el.classList) el.classList.remove('row-selected','selected'); });
  currentRow = 0;
  selectingColumn = false;
}

/* ---------------- build NUMPAD ---------------- */
function criarNumpad(){
  const container = document.getElementById('keyboard');
  if(!container) return;
  container.innerHTML = '';
  botoesTeclado = [];

  const numbers = ['1','2','3','4','5','6','7','8','9','0'];

  // first row: 1..5
  for(let i=0;i<5;i++){
    const b = document.createElement('button');
    b.className = 'num-btn';
    b.textContent = numbers[i];
    b.dataset.value = numbers[i];
    b.addEventListener('click', ()=>{ if(activeMode!=='numpad') return; processarTecla(numbers[i]); resetSelection(); });
    container.appendChild(b);
    botoesTeclado.push(b);
  }

  // special-wrapper (6th column) -> create as compound-cell-like to be compatible with selection code
  const specialWrapper = document.createElement('div');
  specialWrapper.className = 'compound-cell special-wrapper';
  // specials: gear, trash, backspace, enter (distributed vertically)
  const specials = [
    { type:'action', action:'openTabs', icon:'gear' },
    { type:'action', action:'clearAll', icon:'trash' },
    { type:'action', action:'backspace', icon:'backspace' },
    { type:'special', char:'enter', icon:'enter' }
  ];
  specials.forEach(s=>{
    const sb = document.createElement('button');
    // include half-btn class so selection code can iterate halves
    sb.className = 'half-btn sp-btn key-special';
    sb.innerHTML = getIconHTML(s.icon || '');
    sb.addEventListener('click', ()=>{ if(activeMode!=='numpad') return;
      if(s.type === 'action') processarTecla(s);
      else if(s.type === 'special' && s.char === 'enter') processarTecla('enter');
      resetSelection();
    });
    specialWrapper.appendChild(sb);
  });
  container.appendChild(specialWrapper);
  botoesTeclado.push(specialWrapper);

  // second row: 6..0
  for(let i=5;i<10;i++){
    const b = document.createElement('button');
    b.className = 'num-btn';
    b.textContent = numbers[i];
    b.dataset.value = numbers[i];
    b.addEventListener('click', ()=>{ if(activeMode!=='numpad') return; processarTecla(numbers[i]); resetSelection(); });
    container.appendChild(b);
    botoesTeclado.push(b);
  }

  // space-row at bottom (full width)
  const spaceRow = document.createElement('button');
  spaceRow.className = 'space-row';
  spaceRow.innerHTML = getIconHTML('spacebar');
  spaceRow.addEventListener('click', ()=>{ if(activeMode!=='numpad') return; processarTecla('space'); resetSelection(); });
  container.appendChild(spaceRow);
  botoesTeclado.push(spaceRow);

  // set data-mode attribute
  container.setAttribute('data-mode','numpad');

  // clear visual flags
  botoesTeclado.forEach(el => { if(el.classList) el.classList.remove('selected','row-selected'); });
  currentRow = 0;
  selectingColumn = false;
}

/* ---------------- toolbar creation ---------------- */
function criarToolbar(){
  const root = document.getElementById('keyboard-root');
  if(!root) return;
  // if toolbar already exists, do nothing
  if(root.querySelector('.toolbar')) return;

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
    btn.addEventListener('click', ()=> {
      if(b.action === 'numpad') setActivePanel('numpad');
      else if(b.action === 'alpha') setActivePanel('keyboard');
      else document.dispatchEvent(new CustomEvent('toolbar:action', { detail: { action: b.action } }));
      resetSelection();
    });
    group.appendChild(btn);
  });

  toolbar.appendChild(group);

  const existingKeyboard = document.getElementById('keyboard');
  if(existingKeyboard && existingKeyboard.parentNode){
    existingKeyboard.parentNode.insertBefore(toolbar, existingKeyboard);
  } else {
    root.appendChild(toolbar);
  }

  botoesToolbar = Array.from(toolbar.querySelectorAll('.tool-btn'));
}

/* ---------------- timers / highlights / cycles ---------------- */
function stopAllTimers(){
  if(rowIntervalId){ clearInterval(rowIntervalId); rowIntervalId = null; }
  if(colIntervalId){ clearInterval(colIntervalId); colIntervalId = null; }
  if(initialTimeoutId){ clearTimeout(initialTimeoutId); initialTimeoutId = null; }
  selectingColumn = false;
  currentSub = 0;
  colRounds = 0;
}

/* keyboard row highlight */
function highlightRowImmediate(){
  // clear previous
  botoesTeclado.forEach(el => {
    if(el.classList){
      el.classList.remove('row-selected','selected');
      if(el.classList.contains('compound-cell')){
        el.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected','row-selected'));
      }
    }
  });

  const totalRows = Math.ceil(botoesTeclado.length / numColunas);
  const start = currentRow * numColunas;
  for(let i = start; i < start + numColunas && i < botoesTeclado.length; i++){
    const el = botoesTeclado[i];
    if(!el || !el.classList) continue;
    if(el.classList.contains('compound-cell')){
      el.classList.add('row-selected');
      el.querySelectorAll('.half-btn').forEach(h => h.classList.add('row-selected'));
    } else {
      el.classList.add('row-selected');
    }
  }
  currentRow = (currentRow + 1) % totalRows;
}

function startRowCycle(withFirstDelay = true){
  if(activeMode !== 'keyboard' && activeMode !== 'numpad') return;
  stopAllTimers();
  function doRow(){ highlightRowImmediate(); }
  if(withFirstDelay){
    doRow();
    initialTimeoutId = setTimeout(()=>{ doRow(); initialTimeoutId = null; rowIntervalId = setInterval(doRow, ROW_INTERVAL); }, FIRST_ROW_DELAY);
  } else {
    rowIntervalId = setInterval(doRow, ROW_INTERVAL);
    doRow();
  }
}

/* column cycle (works for keyboard and numpad) */
function startColumnCycle(){
  if(rowIntervalId){ clearInterval(rowIntervalId); rowIntervalId = null; }
  if(initialTimeoutId){ clearTimeout(initialTimeoutId); initialTimeoutId = null; }

  selectingColumn = true;
  colRounds = 0;
  currentCol = 0;
  currentSub = 0;

  const totalRows = Math.ceil(botoesTeclado.length / numColunas);
  const lastRow = (currentRow - 1 + totalRows) % totalRows;
  const start = lastRow * numColunas;

  // clear previous
  botoesTeclado.forEach(el => {
    if(el.classList) el.classList.remove('row-selected','selected');
    if(el.classList && el.classList.contains('compound-cell')){
      el.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected','row-selected'));
    }
  });

  colIntervalId = setInterval(()=>{
    // clear selection
    botoesTeclado.forEach(el => {
      if(el.classList && el.classList.contains('compound-cell')){
        el.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected'));
      } else if(el.classList){
        el.classList.remove('selected');
      }
    });

    const idx = start + currentCol;
    if(idx < botoesTeclado.length){
      const el = botoesTeclado[idx];
      if(el && el.classList && el.classList.contains('compound-cell')){
        const halves = el.querySelectorAll('.half-btn');
        if(halves.length){
          const target = halves[currentSub % halves.length];
          target.classList.add('selected');
          currentSub++;
          if(currentSub >= halves.length){
            currentSub = 0;
            currentCol = (currentCol + 1) % numColunas;
            if(currentCol === 0) colRounds++;
          }
        } else {
          el.classList.add('selected');
          currentCol = (currentCol + 1) % numColunas;
          if(currentCol === 0) colRounds++;
        }
      } else if(el && el.classList){
        el.classList.add('selected');
        currentCol = (currentCol + 1) % numColunas;
        if(currentCol === 0) colRounds++;
      } else {
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
      // cleanup
      botoesTeclado.forEach(el => {
        if(el.classList && el.classList.contains('compound-cell')){
          el.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected','row-selected'));
          el.classList.remove('row-selected','selected');
        } else if(el.classList){
          el.classList.remove('selected','row-selected');
        }
      });
      startRowCycle(false);
    }
  }, ROW_INTERVAL);
}

/* ---------------- selection helpers ---------------- */
function getCurrentlySelectedItemKeyboard(){
  for(let i=0;i<botoesTeclado.length;i++){
    const el = botoesTeclado[i];
    if(el.classList && el.classList.contains('compound-cell')){
      const halves = el.querySelectorAll('.half-btn');
      for(let h=0; h<halves.length; h++){
        if(halves[h].classList.contains('selected')){
          const item = teclas[i];
          return (item && item.type === 'compound') ? item.items[h] : undefined;
        }
      }
    } else if(el.classList && el.classList.contains('selected')){
      // btn index corresponds to teclas index for keyboard; for numpad buttons we return textContent
      if(el.classList.contains('num-btn')) return el.textContent;
      return teclas[i];
    }
  }
  return undefined;
}

/* toolbar cycle (simple row highlight on toolbar buttons) */
let toolbarRowIntervalId = null;
let toolbarIndex = 0;
function stopToolbarTimers(){
  if(toolbarRowIntervalId){ clearInterval(toolbarRowIntervalId); toolbarRowIntervalId = null; }
  toolbarIndex = 0;
  botoesToolbar.forEach(b => b.classList.remove('selected','row-selected'));
}
function highlightToolbarImmediate(){
  if(!botoesToolbar || !botoesToolbar.length) return;
  botoesToolbar.forEach(b => b.classList.remove('row-selected'));
  botoesToolbar[toolbarIndex].classList.add('row-selected');
  toolbarIndex = (toolbarIndex + 1) % botoesToolbar.length;
}
function startToolbarCycle(withFirstDelay = true){
  stopToolbarTimers();
  if(!botoesToolbar || !botoesToolbar.length) return;
  function doRow(){ highlightToolbarImmediate(); }
  if(withFirstDelay){
    doRow();
    toolbarRowIntervalId = setInterval(doRow, ROW_INTERVAL);
  } else {
    toolbarRowIntervalId = setInterval(doRow, ROW_INTERVAL);
    doRow();
  }
}

/* seleciona tecla atual (confirm) */
function selecionarTeclaAtual(){
  if(activeMode === 'toolbar'){
    const sel = botoesToolbar.find(b => b.classList.contains('row-selected') || b.classList.contains('selected'));
    if(sel){
      const action = sel.dataset.action;
      if(action === 'numpad') setActivePanel('numpad');
      else if(action === 'alpha') setActivePanel('keyboard');
      else document.dispatchEvent(new CustomEvent('toolbar:action:exec', { detail: { action } }));
    } else {
      startToolbarCycle();
    }
    resetSelection();
    return;
  }

  if(!selectingColumn) startColumnCycle();
  else {
    const item = getCurrentlySelectedItemKeyboard();
    if(item !== undefined) processarTecla(item);
    resetSelection();
  }
}

/* selecionarTeclaNumpadAtual (compat) */
function selecionarTeclaNumpadAtual(){
  // fallback to same logic for numpad: if not selectingColumn -> startColumnCycle; else confirm
  if(activeMode !== 'numpad') return;
  if(!selectingColumn) startColumnCycle();
  else {
    const item = getCurrentlySelectedItemKeyboard();
    if(item !== undefined) processarTecla(item);
    resetSelection();
  }
}

/* ---------------- reset / set mode ---------------- */
function resetSelection(){
  stopAllTimers();
  stopToolbarTimers();
  botoesTeclado.forEach(el => {
    if(el.classList && el.classList.contains('compound-cell')){
      el.classList.remove('row-selected','selected');
      el.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected','row-selected'));
    } else if(el.classList){
      el.classList.remove('row-selected','selected');
    }
  });
  currentRow = 0;
  currentCol = 0;
  currentSub = 0;
  selectingColumn = false;
  colRounds = 0;

  if(activeMode === 'keyboard' || activeMode === 'numpad') startRowCycle(true);
  else if(activeMode === 'toolbar') startToolbarCycle(true);
}

function setActiveMode(mode){
  if(mode !== 'keyboard' && mode !== 'numpad' && mode !== 'toolbar') return;
  activeMode = mode;

  const kbBtn = document.getElementById('toggle-keyboard');
  const npBtn = document.getElementById('toggle-numpad');
  if(kbBtn) kbBtn.classList.toggle('active', mode === 'keyboard');
  if(npBtn) npBtn.classList.toggle('active', mode === 'numpad');

  if(mode === 'keyboard') criarTeclado();
  else if(mode === 'numpad') criarNumpad();
  else if(mode === 'toolbar'){
    // keep keyboard underlying, but start toolbar
    criarTeclado();
    criarToolbar();
  }

  resetSelection();
}

function setActivePanel(panelName){
  if(panelName === 'keyboard') setActiveMode('keyboard');
  else if(panelName === 'numpad') setActiveMode('numpad');
  else if(panelName === 'toolbar') setActiveMode('toolbar');
}

/* ---------------- init ---------------- */
async function init(){
  // preload common icons (best-effort)
  const toPreload = ['backspace','gear','trash','question','spacebar','enter','tools','plus','forward_tab','forward_tab_rev','x','123','abc'];
  await Promise.all(toPreload.map(n => preloadIcon(n).catch(()=>{})));

  // ensure keyboard-root exists inside DOM
  const kp = document.getElementById('keyboard-panel');
  if(kp){
    let root = document.getElementById('keyboard-root');
    if(!root){
      root = document.createElement('div');
      root.id = 'keyboard-root';
      // put keyboard-root at top of keyboard-panel to match CSS hierarchy
      kp.appendChild(root);
    }
    // create keyboard container if missing
    let kb = document.getElementById('keyboard');
    if(!kb){
      kb = document.createElement('div');
      kb.id = 'keyboard';
      kb.className = 'grid-6cols';
      root.appendChild(kb);
    }
  }

  criarToolbar(); // create toolbar DOM (hidden until used)
  criarTeclado(); // build abc keyboard initially
  // criarNumpad not strictly necessary now, will be built when mode set to numpad

  // wire toggle buttons in controls (text labels are in HTML)
  const kbBtn = document.getElementById('toggle-keyboard');
  const npBtn = document.getElementById('toggle-numpad');
  if(kbBtn) { kbBtn.textContent = 'ABC'; kbBtn.onclick = ()=> setActiveMode('keyboard'); }
  if(npBtn) { npBtn.textContent = '123'; npBtn.onclick = ()=> setActiveMode('numpad'); }

  // start in keyboard mode
  setActiveMode(activeMode);
}

/* expose API to window (used by script.js blink handler) */
window.selecionarTeclaAtual = selecionarTeclaAtual;
window.selecionarTeclaNumpadAtual = selecionarTeclaNumpadAtual;
window.resetSelection = resetSelection;
window.toggleCaps = ()=> { capsAtivo = !capsAtivo; criarTeclado(); };

// init on DOM ready
document.addEventListener('DOMContentLoaded', ()=> { init().catch(console.error); });