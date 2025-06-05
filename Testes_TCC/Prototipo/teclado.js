const teclas = [
  'A','B','C','D','←','caps',  // 'X' mudou para '←' (backspace)
  'E','F','G','H','?','–',
  'I','J','K','L','M','N',
  'O','P','QU','R','S','T',
  'U','V','W','X','Y','Z'
];
const teclasNumpad = [
  '1','2','3',
  '4','5','6',
  '7','8','9',
  '0','←'  // backspace no numpad também
];

let capsAtivo = false;
let botoesTeclado = [];
let botoesNumpad = [];
let currentLinha = 0;
let currentColuna = 0;
let currentIndexNumpad = 0;
let modo = 'keyboard';
let cicloPrincipal = null;
let innerCiclo = null;
let selecionandoColuna = false;

const numColunas = 6;

// Teclas consideradas especiais (usar estilo pálido)
const especiais = ['caps', '←', '?', '–'];

function formatarLetra(tecla) {
  if (especiais.includes(tecla)) {
    return tecla;
  }
  return capsAtivo ? tecla.toUpperCase() : tecla.toLowerCase();
}

function processarTecla(tecla) {
  const output = document.getElementById('output');
  if (tecla === 'caps') {
    capsAtivo = !capsAtivo;
    criarTeclado();
    return;
  }
  if (tecla === '←') {
    output.value = output.value.slice(0, -1);
    return;
  }
  if (tecla === '–') {
    output.value += ' ';
    return;
  }
  output.value += formatarLetra(tecla);
}

function criarTeclado() {
  const teclado = document.getElementById('keyboard');
  teclado.innerHTML = '';
  botoesTeclado = [];

  teclas.forEach(tecla => {
    const btn = document.createElement('button');
    btn.textContent = formatarLetra(tecla);
    // Adiciona classe para teclas especiais
    if (especiais.includes(tecla)) {
      btn.classList.add('key-special');
    }
    btn.onclick = () => {
      processarTecla(tecla);
      resetSelection();
    };
    teclado.appendChild(btn);
    botoesTeclado.push(btn);
  });
}

function criarNumpad() {
  const numpad = document.getElementById('numpad');
  numpad.innerHTML = '';
  botoesNumpad = [];

  teclasNumpad.forEach(tecla => {
    const btn = document.createElement('button');
    btn.textContent = tecla;
    // Backspace no numpad também é especial
    if (tecla === '←') {
      btn.classList.add('key-special');
    }
    btn.onclick = () => {
      processarTecla(tecla);
      resetSelection();
    };
    numpad.appendChild(btn);
    botoesNumpad.push(btn);
  });
}

function resetSelection() {
  // Remove classes de seleção de todos os botões
  botoesTeclado.forEach(b => b.classList.remove('selected', 'row-selected'));
  botoesNumpad.forEach(b => b.classList.remove('selected'));
  currentLinha = 0;
  currentColuna = 0;
  currentIndexNumpad = 0;
  selecionandoColuna = false;
  pararCiclo();
  iniciarCiclo();
}

function pararCiclo() {
  clearInterval(cicloPrincipal);
  clearInterval(innerCiclo);
  cicloPrincipal = null;
  innerCiclo = null;
}

function iniciarCiclo() {
  if (modo === 'keyboard') iniciarCicloTeclado();
  else iniciarCicloNumpad();
}

function iniciarCicloTeclado() {
  cicloPrincipal = setInterval(() => {
    // Limpa seleção anterior
    botoesTeclado.forEach(b => b.classList.remove('row-selected', 'selected'));

    // Destaca a fileira inteira: calcula índice de início e fim
    const start = currentLinha * numColunas;
    const end = start + numColunas;
    for (let i = start; i < end && i < botoesTeclado.length; i++) {
      botoesTeclado[i].classList.add('row-selected');
    }

    currentLinha = (currentLinha + 1) % Math.ceil(teclas.length / numColunas);
  }, 1000);
}

function iniciarCicloColuna() {
  clearInterval(cicloPrincipal);
  const linhaIdx = (currentLinha - 1 + Math.ceil(teclas.length / numColunas)) % Math.ceil(teclas.length / numColunas);
  const start = linhaIdx * numColunas;
  let col = 0;

  innerCiclo = setInterval(() => {
    // Limpa seleção de todas as colunas
    botoesTeclado.forEach(b => b.classList.remove('selected'));
    const index = start + col;
    if (index < botoesTeclado.length) {
      botoesTeclado[index].classList.add('selected');
    }
    currentColuna = col;
    col = (col + 1) % numColunas;
  }, 1000);
}

function selecionarTeclaAtual() {
  if (modo === 'keyboard') {
    if (!selecionandoColuna) {
      selecionandoColuna = true;
      iniciarCicloColuna();
    } else {
      clearInterval(innerCiclo);
      const linhaIdx = (currentLinha - 1 + Math.ceil(teclas.length / numColunas)) % Math.ceil(teclas.length / numColunas);
      const teclaIdx = linhaIdx * numColunas + currentColuna;
      const tecla = teclas[teclaIdx];
      if (tecla) processarTecla(tecla);
      resetSelection();
    }
  } else {
    const tecla = teclasNumpad[currentIndexNumpad];
    if (tecla) processarTecla(tecla);
    resetSelection();
  }
}

function iniciarCicloNumpad() {
  cicloPrincipal = setInterval(() => {
    // Limpa seleção anterior
    botoesNumpad.forEach(b => b.classList.remove('selected'));
    // Destaca o próximo botão
    botoesNumpad[currentIndexNumpad].classList.add('selected');
    currentIndexNumpad = (currentIndexNumpad + 1) % botoesNumpad.length;
  }, 1000);
}

function setModo(novoModo) {
  if (novoModo !== 'keyboard' && novoModo !== 'numpad') return;
  modo = novoModo;
  resetSelection();
}

document.addEventListener('DOMContentLoaded', () => {
  criarTeclado();
  criarNumpad();
  iniciarCiclo();
});

window.selecionarTeclaAtual = selecionarTeclaAtual;
window.selecionarTeclaNumpadAtual = selecionarTeclaAtual;
window.setModo = setModo;
window.resetSelection = resetSelection;