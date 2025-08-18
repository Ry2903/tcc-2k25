document.addEventListener('DOMContentLoaded', () => {
  // DOM refs (tolerantes a null)
  const video = document.getElementById('videoEl');
  const canvas = document.getElementById('overlay');
  const piscas = document.getElementById('piscas');
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;

  // controles (podem ser nulos se HTML mudar)
  const thrDec = document.getElementById('thr-dec');
  const thrInc = document.getElementById('thr-inc');
  const framesDec = document.getElementById('frm-dec');
  const framesInc = document.getElementById('frm-inc');
  const debDec = document.getElementById('deb-dec');
  const debInc = document.getElementById('deb-inc');
  const thrValSpan = document.getElementById('threshold-val');
  const framesValSpan = document.getElementById('frames-val');
  const debounceValSpan = document.getElementById('debounce-val');

  // botão de toggle (pode ser nulo)
  const detBtn = document.getElementById('toggle-detection');

  // Estado configurável
  // Detecta o estado inicial a partir do atributo data-detection-active do botão (se houver).
  // Caso contrário, mantém true (comportamento anterior).
  let detectionEnabled = true;
  if (detBtn) {
    const attr = detBtn.getAttribute('data-detection-active');
    if (attr === 'true' || attr === 'false') {
      detectionEnabled = attr === 'true';
    } // senão mantemos true como fallback
  }

  let EAR_THRESHOLD = parseFloat(thrValSpan?.innerText || '0.269') || 0.269;
  let EAR_CONSEC_FRAMES = parseInt(framesValSpan?.innerText || '2', 10) || 2;
  let EAR_REOPEN_FRAMES = EAR_CONSEC_FRAMES;
  let DEBOUNCE_AFTER_BLINK = parseInt(debounceValSpan?.innerText || '3', 10) || 3;

  // Estado runtime
  let totalBlinks = 0;
  let earBelowFrames = 0;
  let earAboveFrames = 0;
  let blinkInProgress = false;
  let debounceFrames = 0;

  // Atualiza spans do UI
  function updateDisplays() {
    if (thrValSpan) thrValSpan.innerText = EAR_THRESHOLD.toFixed(3);
    if (framesValSpan) framesValSpan.innerText = EAR_CONSEC_FRAMES;
    if (debounceValSpan) debounceValSpan.innerText = DEBOUNCE_AFTER_BLINK;
  }
  updateDisplays();

  // Bind dos botões (com checagem)
  if (thrDec) thrDec.addEventListener('click', () => {
    EAR_THRESHOLD = Math.max(0, +(EAR_THRESHOLD - 0.01).toFixed(3));
    updateDisplays();
  });
  if (thrInc) thrInc.addEventListener('click', () => {
    EAR_THRESHOLD = Math.min(1, +(EAR_THRESHOLD + 0.01).toFixed(3));
    updateDisplays();
  });

  if (framesDec) framesDec.addEventListener('click', () => {
    EAR_CONSEC_FRAMES = Math.max(1, EAR_CONSEC_FRAMES - 1);
    EAR_REOPEN_FRAMES = EAR_CONSEC_FRAMES;
    updateDisplays();
  });
  if (framesInc) framesInc.addEventListener('click', () => {
    EAR_CONSEC_FRAMES = EAR_CONSEC_FRAMES + 1;
    EAR_REOPEN_FRAMES = EAR_CONSEC_FRAMES;
    updateDisplays();
  });

  if (debDec) debDec.addEventListener('click', () => {
    DEBOUNCE_AFTER_BLINK = Math.max(0, DEBOUNCE_AFTER_BLINK - 1);
    updateDisplays();
  });
  if (debInc) debInc.addEventListener('click', () => {
    DEBOUNCE_AFTER_BLINK = DEBOUNCE_AFTER_BLINK + 1;
    updateDisplays();
  });

  // ----- face-api + câmera -----
  async function startCameraAndModels() {
    if (!video) {
      console.error('Elemento <video> não encontrado (videoEl).');
      return;
    }

    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('./models')
      ]);
    } catch (err) {
      console.error('Falha ao carregar modelos face-api:', err);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
      video.srcObject = stream;
    } catch (err) {
      console.error('Erro ao acessar câmera:', err);
      return;
    }

    video.addEventListener('playing', () => {
      if (canvas && video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      onPlay();
    });
  }

  function distance(pA, pB) { return Math.hypot(pA.x - pB.x, pA.y - pB.y); }
  function getEAR(eye) {
    const [p1, p2, p3, p4, p5, p6] = eye;
    const a = distance(p2, p6);
    const b = distance(p3, p5);
    const c = distance(p1, p4);
    return (a + b) / (2 * c);
  }

  function onBlinkDetected() {
    totalBlinks++;
    if (piscas) piscas.innerText = `✅ Piscou! Total: ${totalBlinks}`;
    // tenta selecionar tecla conforme implementado no teclado.js
    if (typeof window.selecionarTeclaAtual === 'function') {
      window.selecionarTeclaAtual();
    } else if (typeof window.selecionarTeclaNumpadAtual === 'function') {
      window.selecionarTeclaNumpadAtual();
    }
  }

  async function onPlay() {
    if (!video || video.paused || video.ended || !ctx) {
      requestAnimationFrame(onPlay);
      return;
    }

    let detection = null;
    try {
      detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();
    } catch (err) {
      console.warn('face-api detect erro:', err);
    }

    // limpa canvas sempre (mantemos desenho somente quando detection && detectionEnabled)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detection && detectionEnabled) {
      const resized = faceapi.resizeResults(detection, { width: canvas.width, height: canvas.height });
      faceapi.draw.drawDetections(canvas, resized);
      faceapi.draw.drawFaceLandmarks(canvas, resized);

      const lm = detection.landmarks;
      const leftEAR = getEAR(lm.getLeftEye());
      const rightEAR = getEAR(lm.getRightEye());
      const avgEAR = (leftEAR + rightEAR) / 2;

      if (debounceFrames > 0) {
        debounceFrames--;
        requestAnimationFrame(onPlay);
        return;
      }

      if (avgEAR < EAR_THRESHOLD) {
        earBelowFrames++;
        earAboveFrames = 0;
        if (!blinkInProgress && earBelowFrames >= EAR_CONSEC_FRAMES) blinkInProgress = true;
      } else {
        earAboveFrames++;
        earBelowFrames = 0;
        if (blinkInProgress && earAboveFrames >= EAR_REOPEN_FRAMES) {
          blinkInProgress = false;
          debounceFrames = DEBOUNCE_AFTER_BLINK;
          onBlinkDetected();
        }
      }
    } else {
      // quando detecção está desativada (ou não há detecção), limpamos estados
      earBelowFrames = 0;
      earAboveFrames = 0;
      blinkInProgress = false;
      debounceFrames = 0;

      // se detecção estiver desativada, opcionalmente exibimos indicação
      if (!detectionEnabled) {
        if (piscas) piscas.innerText = `Detecção desativada — Total de piscadas: ${totalBlinks}`;
      } else {
        // quando não há rosto detectado e detecção ativada, mostramos contador normal
        if (piscas) piscas.innerText = `Total de piscadas: ${totalBlinks}`;
      }
    }

    requestAnimationFrame(onPlay);
  }

  // ----- sincronização do botão toggle-detection -----
  // Escuta o evento custom 'detection:toggled' (disparado por teclado.js) e atualiza flag.
  document.addEventListener('detection:toggled', (ev) => {
    try {
      const active = !!(ev && ev.detail && ev.detail.active);
      detectionEnabled = active;
      // exibe status no painel piscas para feedback
      if (piscas) {
        if (detectionEnabled) piscas.innerText = `Detecção ativada — Total de piscadas: ${totalBlinks}`;
        else piscas.innerText = `Detecção desativada — Total de piscadas: ${totalBlinks}`;
      }
      // reset de estados de blink para evitar ações pendentes
      earBelowFrames = 0;
      earAboveFrames = 0;
      blinkInProgress = false;
      debounceFrames = 0;
    } catch (err) {
      console.warn('Erro ao processar detection:toggled:', err);
    }
  });

  // inicia tudo
  startCameraAndModels();
});