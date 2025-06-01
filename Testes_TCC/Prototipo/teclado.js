const teclas = [
  'A','B','C','D','X','caps',
  'E','F','G','H','?','–',
  'I','J','K','L','M','N',
  'O','P','QU','R','S','T',
  'U','V','W','X','Y','Z'
];
const teclasNumpad = [
  '1','2','3',
  '4','5','6',
  '7','8','9',
  '0','X'
];

// 2) Estado de CAPS LOCK e arrays de botões
let capsAtivo = false;
let botoesTeclado = [];
let botoesNumpad = [];
let currentIndexTeclado = 0;
let currentIndexNumpad = 0;

// 3) Modo atual (“keyboard” ou “numpad”) e temporizadores
let modo = 'keyboard';
let cycleInterval = null;
let initialTimeout = null;
let firstCycle = true; // sinaliza se devemos aplicar atraso inicial prolongado

/** Formata a tecla conforme capsAtivo */
function formatarLetra(tecla) {
  if (tecla === 'caps' || tecla === 'X' || tecla === '?' || tecla === '–') {
    return tecla;
  }
  return capsAtivo ? tecla.toUpperCase() : tecla.toLowerCase();
}

/** Processa o clique ou piscada em uma tecla */
function processarTecla(tecla) {
  const output = document.getElementById('output');
  if (tecla === 'caps') {
    capsAtivo = !capsAtivo;
    criarTeclado();
    return;
  }
  if (tecla === 'X') {
    output.value = output.value.slice(0, -1);
    return;
  }
  if (tecla === '–') {
    output.value += ' ';
    return;
  }
  // Letras e “QU” entram aqui
  output.value += formatarLetra(tecla);
}

/** Cria dinamicamente o teclado alfabético */
function criarTeclado() {
  const teclado = document.getElementById('keyboard');
  teclado.innerHTML = '';
  botoesTeclado = [];

  teclas.forEach(tecla => {
    const btn = document.createElement('button');
    btn.textContent = formatarLetra(tecla);
    btn.onclick = () => {
      processarTecla(tecla);
      resetSelection();
    };
    teclado.appendChild(btn);
    botoesTeclado.push(btn);
  });

  // Se modo for “keyboard”, destacamos o índice 0
  botoesTeclado.forEach(b => b.classList.remove('selected'));
  currentIndexTeclado = 0;
  if (modo === 'keyboard' && botoesTeclado.length) {
    botoesTeclado[0].classList.add('selected');
  }
}

/** Cria dinamicamente o numpad */
function criarNumpad() {
  const numpad = document.getElementById('numpad');
  numpad.innerHTML = '';
  botoesNumpad = [];

  teclasNumpad.forEach(tecla => {
    const btn = document.createElement('button');
    btn.textContent = tecla;
    btn.onclick = () => {
      processarTecla(tecla);
      resetSelection();
    };
    numpad.appendChild(btn);
    botoesNumpad.push(btn);
  });

  botoesNumpad.forEach(b => b.classList.remove('selected'));
  currentIndexNumpad = 0;
  if (modo === 'numpad' && botoesNumpad.length) {
    botoesNumpad[0].classList.add('selected');
  }
}

/** Avança seleção no teclado (alfabético) */
function avancarSelecaoTeclado() {
  if (!botoesTeclado.length) return;
  botoesTeclado[currentIndexTeclado].classList.remove('selected');
  currentIndexTeclado = (currentIndexTeclado + 1) % botoesTeclado.length;
  botoesTeclado[currentIndexTeclado].classList.add('selected');
}

/** Avança seleção no numpad */
function avancarSelecaoNumpad() {
  if (!botoesNumpad.length) return;
  botoesNumpad[currentIndexNumpad].classList.remove('selected');
  currentIndexNumpad = (currentIndexNumpad + 1) % botoesNumpad.length;
  botoesNumpad[currentIndexNumpad].classList.add('selected');
}

/** Pressiona tecla destacada no teclado alfabético */
function selecionarTeclaAtual() {
  if (!botoesTeclado.length) return;
  const tecla = teclas[currentIndexTeclado];
  processarTecla(tecla);
  resetSelection();
}

/** Pressiona tecla destacada no numpad */
function selecionarTeclaNumpadAtual() {
  if (!botoesNumpad.length) return;
  const tecla = teclasNumpad[currentIndexNumpad];
  processarTecla(tecla);
  resetSelection();
}

/** Para qualquer ciclo ou timeout pendente */
function pararCicloAutomatico() {
  if (cycleInterval) {
    clearInterval(cycleInterval);
    cycleInterval = null;
  }
  if (initialTimeout) {
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }
}

function resetSelection() {
  // Remove seleção de todos
  botoesTeclado.forEach(b => b.classList.remove('selected'));
  botoesNumpad.forEach(b => b.classList.remove('selected'));

  // Zera índices
  currentIndexTeclado = 0;
  currentIndexNumpad = 0;
  firstCycle = true; // para que no próximo ciclo inicial tenhamos atraso maior

  // Destaca apenas o primeiro do painel ativo
  if (modo === 'keyboard' && botoesTeclado.length) {
    botoesTeclado[0].classList.add('selected');
  }
  if (modo === 'numpad' && botoesNumpad.length) {
    botoesNumpad[0].classList.add('selected');
  }

  // Para qualquer ciclo/timeout existente e reinicia tudo
  pararCicloAutomatico();
  iniciarCicloAutomatico();
}

/** Define o modo (‘keyboard’ ou ‘numpad’) e reinicia seleção/ciclo */
function setModo(novoModo) {
  if (novoModo !== 'keyboard' && novoModo !== 'numpad') return;
  modo = novoModo;
  resetSelection();
}

function iniciarCicloAutomatico() {
  // Para qualquer ciclo ou timeout prévio
  pararCicloAutomatico();

  // Se for a primeira vez após reset, usar atraso prolongado
  if (firstCycle) {
    firstCycle = false; // garantimos que não entre aqui novamente até novo reset
    // Tempo inicial: por exemplo, 2000 ms (pode ajustar conforme quiser)
    const initialDelay = 2000;

    initialTimeout = setTimeout(() => {
      // Após o atraso inicial, avancemos uma vez para o próximo item
      if (modo === 'keyboard') {
        avancarSelecaoTeclado();
      } else {
        avancarSelecaoNumpad();
      }
      // Inicia o intervalo normal a partir daqui
      cycleInterval = setInterval(() => {
        if (modo === 'keyboard') {
          avancarSelecaoTeclado();
        } else {
          avancarSelecaoNumpad();
        }
      }, 1000); // intervalo padrão: 1000 ms (ajustável)
    }, initialDelay);

  } else {
    // Se não for firstCycle, inicia diretamente o intervalo normal
    cycleInterval = setInterval(() => {
      if (modo === 'keyboard') {
        avancarSelecaoTeclado();
      } else {
        avancarSelecaoNumpad();
      }
    }, 1000); // mesmo intervalo padrão
  }
}

// Inicializa ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  criarTeclado();
  criarNumpad();
  iniciarCicloAutomatico();
});

// Exporta funções para script.js
window.selecionarTeclaAtual = selecionarTeclaAtual;
window.selecionarTeclaNumpadAtual = selecionarTeclaNumpadAtual;
window.setModo = setModo;
window.resetSelection = resetSelection;