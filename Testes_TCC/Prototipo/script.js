document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('videoEl');
  const canvas = document.getElementById('overlay');
  const piscas = document.getElementById('piscas');
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;

  const thrDec = document.getElementById('thr-dec');
  const thrInc = document.getElementById('thr-inc');
  const framesDec = document.getElementById('frm-dec');
  const framesInc = document.getElementById('frm-inc');
  const debDec = document.getElementById('deb-dec');
  const debInc = document.getElementById('deb-inc');
  const thrValSpan = document.getElementById('threshold-val');
  const framesValSpan = document.getElementById('frames-val');
  const debounceValSpan = document.getElementById('debounce-val');

  let detBtn = document.getElementById('toggle-detection');

  // detection initial (reads attribute if present)
  let detectionEnabled = true;
  if (detBtn) {
    const attr = detBtn.getAttribute('data-detection-active');
    if (attr === 'true' || attr === 'false') detectionEnabled = attr === 'true';
  }

  function roundToStep(value, step) {
    const precision = Math.round(1 / step);
    return Math.round((value + Number.EPSILON) * precision) / precision;
  }

  let EAR_THRESHOLD = parseFloat(thrValSpan?.innerText) || 0.279;      // 3 casas
  let EAR_CONSEC_FRAMES = parseFloat(framesValSpan?.innerText) || 1.5; // passo 0.1
  let EAR_REOPEN_FRAMES = EAR_CONSEC_FRAMES;
  let DEBOUNCE_AFTER_BLINK = parseFloat(debounceValSpan?.innerText) || 1.0; // passo 0.5

  let totalBlinks = 0;
  let earBelowFrames = 0;
  let earAboveFrames = 0;
  let blinkInProgress = false;
  let debounceFrames = 0;

  function updateDisplays() {
    if (thrValSpan) thrValSpan.innerText = EAR_THRESHOLD.toFixed(3);
    if (framesValSpan) framesValSpan.innerText = EAR_CONSEC_FRAMES.toFixed(1);   // exibe 1 casa decimal
    if (debounceValSpan) debounceValSpan.innerText = DEBOUNCE_AFTER_BLINK.toFixed(1);
  }
  updateDisplays();

  // THRESHOLD (passo 0.001 no seu código anterior; mantive 0.001)
  if (thrDec) thrDec.addEventListener('click', () => {
    EAR_THRESHOLD = Math.max(0, roundToStep(EAR_THRESHOLD - 0.001, 0.001));
    updateDisplays();
  });
  if (thrInc) thrInc.addEventListener('click', () => {
    EAR_THRESHOLD = Math.min(1, roundToStep(EAR_THRESHOLD + 0.001, 0.001));
    updateDisplays();
  });

  // FRAMES (passo 0.1)
  if (framesDec) framesDec.addEventListener('click', () => {
    EAR_CONSEC_FRAMES = Math.max(0, roundToStep(EAR_CONSEC_FRAMES - 0.1, 0.1));
    EAR_REOPEN_FRAMES = EAR_CONSEC_FRAMES;
    updateDisplays();
  });
  if (framesInc) framesInc.addEventListener('click', () => {
    EAR_CONSEC_FRAMES = Math.max(0, roundToStep(EAR_CONSEC_FRAMES + 0.1, 0.1));
    EAR_REOPEN_FRAMES = EAR_CONSEC_FRAMES;
    updateDisplays();
  });

  // DEBOUNCE (passo 0.5)
  if (debDec) debDec.addEventListener('click', () => {
    DEBOUNCE_AFTER_BLINK = Math.max(0, roundToStep(DEBOUNCE_AFTER_BLINK - 0.5, 0.5));
    updateDisplays();
  });
  if (debInc) debInc.addEventListener('click', () => {
    DEBOUNCE_AFTER_BLINK = roundToStep(DEBOUNCE_AFTER_BLINK + 0.5, 0.5);
    updateDisplays();
  });

  async function startCameraAndModels() {
    if (!video) { console.error('videoEl não encontrado'); return; }
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
    if (typeof window.selecionarTeclaAtual === 'function') window.selecionarTeclaAtual();
    else if (typeof window.selecionarTeclaNumpadAtual === 'function') window.selecionarTeclaNumpadAtual();
  }

  async function onPlay() {
    if (!video || video.paused || video.ended || !ctx) { requestAnimationFrame(onPlay); return; }
    let detection = null;
    try {
      detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
    } catch (err) {
      console.warn('face-api detect erro:', err);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detection && detectionEnabled) {
      const resized = faceapi.resizeResults(detection, { width: canvas.width, height: canvas.height });
      faceapi.draw.drawDetections(canvas, resized);
      faceapi.draw.drawFaceLandmarks(canvas, resized);
      const lm = detection.landmarks;
      const leftEAR = getEAR(lm.getLeftEye());
      const rightEAR = getEAR(lm.getRightEye());
      const avgEAR = (leftEAR + rightEAR) / 2;

      if (debounceFrames > 0) { debounceFrames--; requestAnimationFrame(onPlay); return; }

      if (avgEAR < EAR_THRESHOLD) {
        earBelowFrames++; earAboveFrames = 0;
        if (!blinkInProgress && earBelowFrames >= EAR_CONSEC_FRAMES) blinkInProgress = true;
      } else {
        earAboveFrames++; earBelowFrames = 0;
        if (blinkInProgress && earAboveFrames >= EAR_REOPEN_FRAMES) {
          blinkInProgress = false;
          debounceFrames = DEBOUNCE_AFTER_BLINK;
          onBlinkDetected();
        }
      }
    } else {
      earBelowFrames = 0; earAboveFrames = 0; blinkInProgress = false; debounceFrames = 0;
      if (!detectionEnabled) {
        if (piscas) piscas.innerText = `Detecção desativada — Total de piscadas: ${totalBlinks}`;
      } else {
        if (piscas) piscas.innerText = `Total de piscadas: ${totalBlinks}`;
      }
    }

    requestAnimationFrame(onPlay);
  }

  // sincroniza toggle-detection: escuta evento disparado por teclado.js (ou outro)
  document.addEventListener('detection:toggled', (ev) => {
    try {
      const active = !!(ev && ev.detail && ev.detail.active);
      detectionEnabled = active;
      if (piscas) {
        if (detectionEnabled) piscas.innerText = `Detecção ativada — Total de piscadas: ${totalBlinks}`;
        else piscas.innerText = `Detecção desativada — Total de piscadas: ${totalBlinks}`;
      }
      earBelowFrames = 0; earAboveFrames = 0; blinkInProgress = false; debounceFrames = 0;
    } catch (err) {
      console.warn('Erro ao processar detection:toggled:', err);
    }
  });

  // wire control toggle-detection button (textual) - this button is in the controls area
  detBtn = document.getElementById('toggle-detection');
  if (detBtn) {
    detBtn.setAttribute('data-detection-active', String(detectionEnabled));
    if (detectionEnabled) detBtn.textContent = 'Desativar detecção';
    else detBtn.textContent = 'Ativar detecção';
    detBtn.onclick = () => {
      const cur = detBtn.getAttribute('data-detection-active') === 'true';
      const next = !cur;
      detBtn.setAttribute('data-detection-active', String(next));
      detBtn.textContent = next ? 'Desativar detecção' : 'Ativar detecção';
      document.dispatchEvent(new CustomEvent('detection:toggled', { detail: { active: next } }));
    };
  }

  startCameraAndModels();
});