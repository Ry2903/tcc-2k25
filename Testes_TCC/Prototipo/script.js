// Habilita/desabilita a detecção de piscada
let detectionEnabled = true;

// Parâmetros (usar let para permitir ajuste dinâmico)
let EAR_THRESHOLD = 0.269;
let EAR_CONSEC_FRAMES = 2;
let EAR_REOPEN_FRAMES = EAR_CONSEC_FRAMES;
let DEBOUNCE_AFTER_BLINK = 0.5;

// Contadores internos de piscada
let totalBlinks = 0;
let earBelowFrames = 0;
let earAboveFrames = 0;
let blinkInProgress = false;
let debounceFrames = 0;

// Modo atual para selecionar teclado ou numpad
let currentMode = 'keyboard'; // ou 'numpad'


const video = document.getElementById('videoEl');
const canvas = document.getElementById('overlay');
const piscas = document.getElementById('piscas');
const ctx = canvas.getContext('2d');

// Controles de configuração
const thrDec = document.getElementById('thr-dec');
const thrInc = document.getElementById('thr-inc');
const framesDec = document.getElementById('frm-dec');
const framesInc = document.getElementById('frm-inc');
const debDec = document.getElementById('deb-dec');
const debInc = document.getElementById('deb-inc');
const thrValSpan = document.getElementById('threshold-val');
const framesValSpan = document.getElementById('frames-val');
const debounceValSpan = document.getElementById('debounce-val');
const toggleBtn = document.getElementById('toggle-detection');
const toggleModeBtn = document.getElementById('toggle-mode');

// Ajustar EAR_THRESHOLD
thrDec.addEventListener('click', () => {
  EAR_THRESHOLD = Math.max(0, EAR_THRESHOLD - 0.01);
  thrValSpan.innerText = EAR_THRESHOLD.toFixed(3);
});
thrInc.addEventListener('click', () => {
  EAR_THRESHOLD = Math.min(1, EAR_THRESHOLD + 0.01);
  thrValSpan.innerText = EAR_THRESHOLD.toFixed(3);
});

// Ajustar EAR_CONSEC_FRAMES
framesDec.addEventListener('click', () => {
  EAR_CONSEC_FRAMES = Math.max(1, EAR_CONSEC_FRAMES - 0.1);
  framesValSpan.innerText = EAR_CONSEC_FRAMES;
});
framesInc.addEventListener('click', () => {
  EAR_CONSEC_FRAMES++;
  framesValSpan.innerText = EAR_CONSEC_FRAMES;
});

// Ajustar DEBOUNCE_AFTER_BLINK
debDec.addEventListener('click', () => {
  DEBOUNCE_AFTER_BLINK = Math.max(1, DEBOUNCE_AFTER_BLINK - 0.01);
  debounceValSpan.innerText = DEBOUNCE_AFTER_BLINK;
});
debInc.addEventListener('click', () => {
  DEBOUNCE_AFTER_BLINK += 0.01;
  debounceValSpan.innerText = DEBOUNCE_AFTER_BLINK;
});

// Botão para ativar/desativar detecção de piscadas
toggleBtn.addEventListener('click', () => {
  detectionEnabled = !detectionEnabled;
  toggleBtn.innerText = detectionEnabled
    ? 'Desativar Detecção'
    : 'Ativar Detecção';
});

// Botão para alternar entre Teclado e Numpad
toggleModeBtn.addEventListener('click', () => {
  currentMode = currentMode === 'keyboard' ? 'numpad' : 'keyboard';
  toggleModeBtn.innerText =
    currentMode === 'keyboard' ? 'Usar Numpad' : 'Usar Teclado';

  // Ajusta o modo em teclado.js (recomeça seleção, destaca painel correto)
  if (typeof window.setModo === 'function') {
    window.setModo(currentMode);
  }
});

async function start() {
  // Carrega modelos do face-api.js
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('./models')
  ]);

  // Solicita permissão de câmera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  } catch (err) {
    console.error('Erro ao acessar câmera:', err);
    return;
  }

  // Quando o vídeo começar a rodar, configura o canvas e chama onPlay()
  video.addEventListener('playing', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    onPlay();
  });
}

async function onPlay() {
  if (video.paused || video.ended) return;

  // Detecta face + landmarks
  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks();

  // Limpa canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Processa apenas se detectar rosto e se detecção estiver ativada
  if (detection && detectionEnabled) {
    const resized = faceapi.resizeResults(detection, {
      width: canvas.width,
      height: canvas.height
    });
    faceapi.draw.drawDetections(canvas, resized);
    faceapi.draw.drawFaceLandmarks(canvas, resized);

    const lm = detection.landmarks;
    const leftEAR = getEAR(lm.getLeftEye());
    const rightEAR = getEAR(lm.getRightEye());
    const avgEAR = (leftEAR + rightEAR) / 2;

    // Se em debounce, só decrementa e retorna
    if (debounceFrames > 0) {
      debounceFrames--;
      requestAnimationFrame(onPlay);
      return;
    }

    // Lógica “olho fechado”
    if (avgEAR < EAR_THRESHOLD) {
      earBelowFrames++;
      earAboveFrames = 0;
      if (!blinkInProgress && earBelowFrames >= EAR_CONSEC_FRAMES) {
        blinkInProgress = true;
      }
    } else {
      // Lógica “olho reaberto”
      earAboveFrames++;
      earBelowFrames = 0;
      if (blinkInProgress && earAboveFrames >= EAR_REOPEN_FRAMES) {
        blinkInProgress = false;
        totalBlinks++;
        piscas.innerText = `✅ Piscou! Total: ${totalBlinks}`;

        // Dispara a tecla no painel ativo
        if (
          currentMode === 'keyboard' &&
          typeof window.selecionarTeclaAtual === 'function'
        ) {
          window.selecionarTeclaAtual();
        } else if (
          currentMode === 'numpad' &&
          typeof window.selecionarTeclaNumpadAtual === 'function'
        ) {
          window.selecionarTeclaNumpadAtual();
        }

        // Inicia debounce
        debounceFrames = DEBOUNCE_AFTER_BLINK;
      }
    }
  } else {
    // Se não detectou rosto ou desativado, zera estados
    earBelowFrames = 0;
    earAboveFrames = 0;
    blinkInProgress = false;
    debounceFrames = 0;
  }

  requestAnimationFrame(onPlay);
}

function getEAR(eye) {
  const [p1, p2, p3, p4, p5, p6] = eye;
  const a = distance(p2, p6);
  const b = distance(p3, p5);
  const c = distance(p1, p4);
  return (a + b) / (2 * c);
}

function distance(pA, pB) {
  return Math.hypot(pA.x - pB.x, pA.y - pB.y);
}

// Inicia todo o processo
start();