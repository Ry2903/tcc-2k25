const teclas = [
  'A','B','C','D',{ type:'action', action:'backspace', icon:'backspace' },
  { type:'compound', items: ['caps', { type: 'action', action: 'openTabs', icon: 'gear' }] },
  'E','F','G','H','?', { type:'compound', items: ['–', { type:'action', action:'clearAll', icon:'trash' }] },
  'I','J','K','L','M','N',
  'O','P','QU','R','S','T',
  'U','V','W','X','Y','Z'
];

const teclasNumpad = [
  '1','2','3',
  '4','5','6',
  '7','8','9',
  '0',
  { type:'action', action:'backspace', icon:'backspace' },
  { type:'action', action:'openTabs', icon:'gear' }
];

let capsAtivo = false;
let botoesTeclado = []; // array de elementos: <button> ou <div.compound-cell>
let botoesNumpad = [];
let activeMode = 'keyboard';

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

let currentNumpadIndex = 0;

const especiais = ['caps','?','–'];

/* ---------------- ICON HELPERS (mantém compatibilidade com sua pasta /icons) */
const iconsCache = new Map();
const PRESERVE_STYLES = new Set(['backspace','trash']);

function wrapIconHTML(svgInner, name, preserve = false){
  const cls = preserve ? 'btn-icon preserve' : 'btn-icon';
  if(name === 'spacebar') {
    return `<span class="${cls} space-icon" aria-hidden="true">${svgInner}</span>`;
  }
  return `<span class="${cls}" aria-hidden="true">${svgInner}</span>`;
}

function iconSVGFallback(name){
  if(name === 'gear') {
    return wrapIconHTML(`<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 12 2h-4a.5.5 0 0 0-.5.42l-.36 2.54c-.56.22-1.09.5-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.7 8.9a.5.5 0 0 0 .12.64l2.03 1.58c-.04.3-.06.61-.06.94s.02.64.06.94L2.82 15.6a.5.5 0 0 0-.12.64l1.92 3.32c.14.25.42.36.68.28l2.39-.96c.53.44 1.06.8 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h4a.5.5 0 0 0 .5-.42l.36-2.54c.56-.22 1.09-.5 1.62-.94l2.39.96c.26.08.54-.03.68-.28l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z"/></svg>`, name);
  }
  if(name === 'trash') {
    return wrapIconHTML(`<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"><path d="M6 7h12v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7zm3-4h6l1 1h3v2H2V4h3l1-1z"/></svg>`, name, PRESERVE_STYLES.has(name));
  }
  if(name === 'backspace') {
    return wrapIconHTML(`<svg viewBox="0 0 16 16" preserveAspectRatio="xMidYMid meet"><path d="M15.683 3a2 2 0 0 0-2-2h-7.08a2 2 0 0 0-1.519.698L.241 7.35a1 1 0 0 0 0 1.302l4.843 5.65A2 2 0 0 0 6.603 15h7.08a2 2 0 0 0 2-2zM5.829 5.854a.5.5 0 1 1 .707-.708l2.147 2.147 2.146-2.147a.5.5 0 1 1 .707.708L9.39 8l2.146 2.146a.5.5 0 0 1-.707.708L8.683 8.707l-2.147 2.147a.5.5 0 0 1-.707-.708L7.976 8z"/></svg>`, name, PRESERVE_STYLES.has(name));
  }
  if(name === 'question') {
    return wrapIconHTML(`<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm1.07-7.75-.9.92A2 2 0 0 0 12 12h-2v-1a3 3 0 0 1 .88-2.12A2.99 2.99 0 0 1 13 7a3 3 0 0 1 0 6z"/></svg>`, name);
  }
  if(name === 'spacebar') {
    return wrapIconHTML(`<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"><rect x="2" y="8" width="20" height="8" rx="2"/></svg>`, name);
  }
  return `<span class="btn-icon" aria-hidden="true"></span>`;
}

// carrega SVG externo e normaliza (preserva backspace/trash)
async function preloadIcon(name){
  if(!name) return;
  if(iconsCache.has(name)) return;
  try {
    const url = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL(`icons/${name}.svg`)
      : `icons/${name}.svg`;
    const resp = await fetch(url);
    if(!resp.ok) throw new Error('SVG não encontrado: ' + url);
    let svgText = await resp.text();
    svgText = svgText.replace(/<\?xml[\s\S]*?\?>/i, '');
    svgText = svgText.replace(/<!--[\s\S]*?-->/g, '');
    svgText = svgText.replace(/\s(width|height)="[^"]*"/gi, '');
    svgText = svgText.replace(/<svg([^>]*)>/i, (m, attrs) => {
      if(/preserveAspectRatio=/i.test(attrs)) return `<svg${attrs} width="100%" height="100%">`;
      return `<svg${attrs} preserveAspectRatio="xMidYMid meet" width="100%" height="100%">`;
    });

    if(PRESERVE_STYLES.has(name)){
      iconsCache.set(name, wrapIconHTML(svgText, name, true));
      return;
    }

    svgText = svgText.replace(/(fill|stroke)=['"]([^'"]*)['"]/gi, (m, attr, val) => {
      if(/currentColor/i.test(val) || /none/i.test(val)) return `${attr}="${val}"`;
      return `${attr}="currentColor"`;
    });

    svgText = svgText.replace(/style=(['"])(.*?)\1/gi, (m,q,content) => {
      let replaced = content.replace(/(fill\s*:\s*)([^;]+)(;?)/gi,'$1currentColor$3');
      replaced = replaced.replace(/(stroke\s*:\s*)([^;]+)(;?)/gi,'$1currentColor$3');
      return `style=${q}${replaced}${q}`;
    });

    iconsCache.set(name, wrapIconHTML(svgText, name, false));
  } catch (err) {
    console.warn('preloadIcon falhou para', name, err);
    iconsCache.set(name, iconSVGFallback(name));
  }
}

function getIconHTML(name){
  if(!name) return `<span class="btn-icon" aria-hidden="true"></span>`;
  if(iconsCache.has(name)) return iconsCache.get(name);
  // fallback imediato
  const fallback = iconSVGFallback(name);
  iconsCache.set(name, fallback);
  return fallback;
}

function preloadIcons(names = []) {
  return Promise.all(names.map(n => preloadIcon(n)));
}

/* ----------------- UTILITÁRIOS DE APLICAÇÃO VISUAL ----------------- */

/**
 * Aplica row-selected à célula (wrapper) e a todos os half-btns filhos.
 * Usa apenas classes (sem inline styles).
 */
function applyRowToCell(wrapperEl){
  if(!wrapperEl) return;
  wrapperEl.classList.add('row-selected');
  const halves = wrapperEl.querySelectorAll('.half-btn');
  halves.forEach(h => h.classList.add('row-selected'));
}

/** Remove row-selected de wrapper e filhos */
function clearRowFromCell(wrapperEl){
  if(!wrapperEl) return;
  wrapperEl.classList.remove('row-selected');
  const halves = wrapperEl.querySelectorAll('.half-btn');
  halves.forEach(h => h.classList.remove('row-selected'));
}

/* -------------------- LÓGICA DO TECLADO -------------------- */

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
    if(item.action === 'openTabs'){ document.dispatchEvent(new CustomEvent('keyboard:openTabs')); return; }
    if(item.action === 'backspace'){ out.value = out.value.slice(0, -1); return; }
    return;
  }
  if(item === 'caps'){ capsAtivo = !capsAtivo; criarTeclado(); return; }
  if(item === '–'){ out.value += ' '; return; }
  out.value += formatarLabel(item);
}

/* -------------------- CRIAÇÃO DO TECLADO E NUMPAD -------------------- */

function criarTeclado(){
  const container = document.getElementById('keyboard');
  if(!container) return;
  container.innerHTML = '';
  botoesTeclado = [];

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
          half.addEventListener('click', () => { if(activeMode !== 'keyboard') return; processarTecla(sub); resetSelection(); });
        } else {
          if(sub === '?'){
            half.innerHTML = getIconHTML('question');
            half.classList.add('key-special');
            half.addEventListener('click', () => { if(activeMode !== 'keyboard') return; processarTecla(sub); resetSelection(); });
          } else if(sub === '–'){
            half.innerHTML = getIconHTML('spacebar');
            half.classList.add('key-special');
            half.addEventListener('click', () => { if(activeMode !== 'keyboard') return; processarTecla(sub); resetSelection(); });
          } else {
            half.textContent = formatarLabel(sub);
            if(especiais.includes(sub)) half.classList.add('key-special');
            half.addEventListener('click', () => { if(activeMode !== 'keyboard') return; processarTecla(sub); resetSelection(); });
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
      btn.addEventListener('click', () => { if(activeMode !== 'keyboard') return; processarTecla(item); resetSelection(); });
    } else {
      if(item === '?'){
        btn.innerHTML = getIconHTML('question');
        btn.classList.add('key-special');
      } else if(item === '–'){
        btn.innerHTML = getIconHTML('spacebar');
        btn.classList.add('key-special');
      } else {
        btn.textContent = formatarLabel(item);
        if(especiais.includes(item)) btn.classList.add('key-special');
      }
      btn.addEventListener('click', () => { if(activeMode !== 'keyboard') return; processarTecla(item); resetSelection(); });
    }
    container.appendChild(btn);
    botoesTeclado.push(btn);
  });

  // limpa classes
  botoesTeclado.forEach(el => {
    if(el.classList){
      el.classList.remove('row-selected','selected');
      if(el.classList.contains('compound-cell')){
        el.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected','row-selected'));
      }
    }
  });

  currentRow = 0;
  selectingColumn = false;
}

function criarNumpad(){
  const np = document.getElementById('numpad');
  if(!np) return;
  np.innerHTML = '';
  botoesNumpad = [];

  teclasNumpad.forEach(item => {
    const btn = document.createElement('button');
    if(typeof item === 'object' && item.type === 'action'){
      btn.className = 'icon-btn key-special';
      btn.innerHTML = getIconHTML(item.icon || '');
      btn.addEventListener('click', () => { if(activeMode !== 'numpad') return; processarTecla(item); resetSelection(); });
    } else {
      btn.textContent = item;
      btn.addEventListener('click', () => { if(activeMode !== 'numpad') return; processarTecla(item); resetSelection(); });
    }
    np.appendChild(btn);
    botoesNumpad.push(btn);
  });

  botoesNumpad.forEach(b => b.classList.remove('selected'));
  currentNumpadIndex = 0;
}

/* -------------------- CICLOS / HIGHLIGHTS -------------------- */

function stopAllTimers(){
  if(rowIntervalId){ clearInterval(rowIntervalId); rowIntervalId = null; }
  if(colIntervalId){ clearInterval(colIntervalId); colIntervalId = null; }
  if(initialTimeoutId){ clearTimeout(initialTimeoutId); initialTimeoutId = null; }
  selectingColumn = false;
  currentSub = 0;
  colRounds = 0;
}

function clearRowSelectionVisuals(){
  botoesTeclado.forEach(el => {
    if(el.classList && el.classList.contains('compound-cell')){
      el.classList.remove('row-selected','selected');
      el.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected','row-selected'));
    } else if(el.classList){
      el.classList.remove('row-selected','selected');
    }
  });
}

function highlightRowImmediate(){
  clearRowSelectionVisuals();
  const totalRows = Math.ceil(teclas.length / numColunas);
  const start = currentRow * numColunas;
  for(let i = start; i < start + numColunas && i < botoesTeclado.length; i++){
    const el = botoesTeclado[i];
    if(!el || !el.classList) continue;
    // adiciona row-selected ao wrapper
    el.classList.add('row-selected');
    // e também explicitamente a cada half-btn dentro do wrapper (se houver)
    if(el.classList.contains('compound-cell')){
      el.querySelectorAll('.half-btn').forEach(h => h.classList.add('row-selected'));
    }
  }
  currentRow = (currentRow + 1) % totalRows;
}

function startRowCycle(withFirstDelay = true){
  if(activeMode !== 'keyboard') return;
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

function startColumnCycle(){
  if(rowIntervalId){ clearInterval(rowIntervalId); rowIntervalId = null; }
  if(initialTimeoutId){ clearTimeout(initialTimeoutId); initialTimeoutId = null; }

  selectingColumn = true;
  colRounds = 0;
  currentCol = 0;
  currentSub = 0;

  const totalRows = Math.ceil(teclas.length / numColunas);
  const lastRow = (currentRow - 1 + totalRows) % totalRows;
  const start = lastRow * numColunas;

  clearRowSelectionVisuals();

  colIntervalId = setInterval(()=>{
    // limpa selects anteriores
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
      // limpar selects antes de voltar ao row cycle
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

/* seleção/identificação */
function getCurrentlySelectedItemKeyboard(){
  for(let i = 0; i < botoesTeclado.length; i++){
    const el = botoesTeclado[i];
    if(el.classList && el.classList.contains('compound-cell')){
      const halves = el.querySelectorAll('.half-btn');
      for(let h = 0; h < halves.length; h++){
        if(halves[h].classList.contains('selected')) {
          const item = teclas[i];
          return (item && item.type === 'compound') ? item.items[h] : undefined;
        }
      }
    } else if(el.classList && el.classList.contains('selected')){
      return teclas[i];
    }
  }
  return undefined;
}

function selecionarTeclaAtual(){
  if(activeMode !== 'keyboard') return;
  if(!selectingColumn) startColumnCycle();
  else {
    const item = getCurrentlySelectedItemKeyboard();
    if(item !== undefined) processarTecla(item);
    resetSelection();
  }
}

function selecionarTeclaNumpadAtual(){
  if(activeMode !== 'numpad') return;
  if(!botoesNumpad.length) return;
  const val = teclasNumpad[currentNumpadIndex];
  processarTecla(val);
  resetSelection();
}

function startNumpadCycle(){
  if(activeMode !== 'numpad') return;
  stopAllTimers();
  botoesNumpad.forEach(b => b.classList.remove('selected'));
  currentNumpadIndex = 0;
  if(botoesNumpad.length) botoesNumpad[currentNumpadIndex].classList.add('selected');
  rowIntervalId = setInterval(()=>{
    botoesNumpad.forEach(b => b.classList.remove('selected'));
    currentNumpadIndex = (currentNumpadIndex + 1) % botoesNumpad.length;
    botoesNumpad[currentNumpadIndex].classList.add('selected');
  }, ROW_INTERVAL);
}

function resetSelection(){
  stopAllTimers();
  botoesTeclado.forEach(el => {
    if(el.classList && el.classList.contains('compound-cell')){
      el.classList.remove('row-selected','selected');
      el.querySelectorAll('.half-btn').forEach(h => h.classList.remove('selected','row-selected'));
    } else if(el.classList) {
      el.classList.remove('row-selected','selected');
    }
  });
  botoesNumpad.forEach(b => b.classList.remove('selected'));
  currentRow = 0;
  currentCol = 0;
  currentSub = 0;
  currentNumpadIndex = 0;
  selectingColumn = false;
  colRounds = 0;
  if(activeMode === 'keyboard') startRowCycle(true);
  else startNumpadCycle();
}

function setActiveMode(mode){
  if(mode !== 'keyboard' && mode !== 'numpad') return;
  activeMode = mode;
  const kbBtn = document.getElementById('toggle-keyboard');
  const npBtn = document.getElementById('toggle-numpad');
  if(kbBtn) kbBtn.classList.toggle('active', mode === 'keyboard');
  if(npBtn) npBtn.classList.toggle('active', mode === 'numpad');
  resetSelection();
}

/* init */
async function init(){
  await preloadIcons(['backspace','gear','question','spacebar','trash']).catch(()=>{});
  criarTeclado();
  criarNumpad();

  const kp = document.getElementById('keyboard-panel'); if(kp) kp.style.display = '';
  const np = document.getElementById('numpad-panel'); if(np) np.style.display = '';

  const kbBtn = document.getElementById('toggle-keyboard');
  const npBtn = document.getElementById('toggle-numpad');
  const detBtn = document.getElementById('toggle-detection');

  /* ------------- ALTERAÇÃO PRINCIPAL: toggle-detection textual ------------- */
  if(detBtn){
    // estado inicial: detection desligada
    detBtn.setAttribute('data-detection-active','false');
    detBtn.classList.remove('active');
    detBtn.textContent = 'Ativar detecção'; // texto inicial
    detBtn.setAttribute('aria-pressed','false');

    // função de atualização visual/textual
    const updateDetectionButton = (el, active) => {
      if(!el) return;
      if(active){
        el.textContent = 'Desativar detecção';
        el.classList.add('active');
        el.setAttribute('aria-pressed','true');
      } else {
        el.textContent = 'Ativar detecção';
        el.classList.remove('active');
        el.setAttribute('aria-pressed','false');
      }
    };

    detBtn.onclick = () => {
      const cur = detBtn.getAttribute('data-detection-active') === 'true';
      const next = !cur;
      detBtn.setAttribute('data-detection-active', String(next));
      updateDetectionButton(detBtn, next);
      // despacha evento custom para o restante da app reagir
      document.dispatchEvent(new CustomEvent('detection:toggled', { detail: { active: next } }));
    };
  }

  /* ------------------------------------------------------------------------- */

  if(kbBtn){ kbBtn.textContent = 'ABC'; kbBtn.title='Ativar Teclado'; kbBtn.onclick = () => setActiveMode('keyboard'); }
  if(npBtn){ npBtn.textContent = '123'; npBtn.title='Ativar Numpad'; npBtn.onclick = () => setActiveMode('numpad'); }

  if(kbBtn) kbBtn.classList.toggle('active', activeMode === 'keyboard');
  if(npBtn) npBtn.classList.toggle('active', activeMode === 'numpad');

  setActiveMode(activeMode);
}

window.selecionarTeclaAtual = selecionarTeclaAtual;
window.selecionarTeclaNumpadAtual = selecionarTeclaNumpadAtual;
window.resetSelection = resetSelection;
window.toggleCaps = () => { capsAtivo = !capsAtivo; criarTeclado(); };

document.addEventListener('keyboard:openTabs', () => { console.log('keyboard:openTabs disparado'); });
document.addEventListener('DOMContentLoaded', () => { init().catch(console.error); });