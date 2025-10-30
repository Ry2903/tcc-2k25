(function () {
  'use strict';
  const LIBS_FACEAPI = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('../libs/face-api.min.js')
    : '../libs/face-api.min.js';

  const MODELS_BASE = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('../models')
    : '../models';

  // --- DOM refs (populated in init) ---
  let video = null;
  let canvas = null;
  let ctx = null;
  let piscasEl = null;
  let thrDec = null, thrInc = null, framesDec = null, framesInc = null, debDec = null, debInc = null;
  let thrValSpan = null, framesValSpan = null, debounceValSpan = null;
  let detBtn = null;

  // --- detection params (defaults) ---
  let EAR_THRESHOLD = 0.279;      // 3 casas
  let EAR_CONSEC_FRAMES = 1.5;    // passo 0.1
  let EAR_REOPEN_FRAMES = EAR_CONSEC_FRAMES;
  let DEBOUNCE_AFTER_BLINK = 1.0; // passo 0.5

  // --- runtime state ---
  let detectionEnabled = true;
  let totalBlinks = 0;
  let earBelowFrames = 0;
  let earAboveFrames = 0;
  let blinkInProgress = false;
  let debounceFrames = 0;

  let stream = null;
  let animationId = null;
  let playing = false;
  let modelsLoaded = false;
  let faceapiLoaded = false;
  let running = false;

  // convenience
  function log(...args) { if (window.__kb_debug) console.log(...args); }

  // --- helpers ---
  function roundToStep(value, step) {
    const precision = Math.round(1 / step);
    return Math.round((value + Number.EPSILON) * precision) / precision;
  }

  function updateDisplays() {
    if (thrValSpan) thrValSpan.innerText = EAR_THRESHOLD.toFixed(3);
    if (framesValSpan) framesValSpan.innerText = EAR_CONSEC_FRAMES.toFixed(1);
    if (debounceValSpan) debounceValSpan.innerText = DEBOUNCE_AFTER_BLINK.toFixed(1);
  }

  function distance(pA, pB) { return Math.hypot(pA.x - pB.x, pA.y - pB.y); }
  function getEAR(eye) {
    const [p1, p2, p3, p4, p5, p6] = eye;
    const a = distance(p2, p6);
    const b = distance(p3, p5);
    const c = distance(p1, p4);
    return (a + b) / (2 * c);
  }

  // load arbitrary script (used to load face-api fallback)
  function loadScriptURL(url) {
    return new Promise((resolve, reject) => {
      try {
        const s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(new Error('Falha ao carregar script: ' + url));
        document.head.appendChild(s);
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- main detection loop ---
  async function onPlay() {
    if (!playing || !ctx || !video) {
      animationId = requestAnimationFrame(onPlay);
      return;
    }

    let detection = null;
    try {
      detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
    } catch (err) {
      // face-api pode lançar ocasionalmente; log e continuar
      log('face-api detect erro:', err);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detection && detectionEnabled) {
      try {
        const resized = faceapi.resizeResults(detection, { width: canvas.width, height: canvas.height });
        if (faceapi.draw && typeof faceapi.draw.drawDetections === 'function') {
          faceapi.draw.drawDetections(canvas, resized);
          faceapi.draw.drawFaceLandmarks(canvas, resized);
        }
        const lm = detection.landmarks;
        const leftEAR = getEAR(lm.getLeftEye());
        const rightEAR = getEAR(lm.getRightEye());
        const avgEAR = (leftEAR + rightEAR) / 2;

        if (debounceFrames > 0) { debounceFrames--; animationId = requestAnimationFrame(onPlay); return; }

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
      } catch (err) {
        log('Erro no processamento dos landmarks:', err);
      }
    } else {
      // sem detecção
      earBelowFrames = 0; earAboveFrames = 0; blinkInProgress = false; debounceFrames = 0;
      if (piscasEl) {
        if (!detectionEnabled) piscasEl.innerText = `Detecção desativada — Total de piscadas: ${totalBlinks}`;
        else piscasEl.innerText = `Total de piscadas: ${totalBlinks}`;
      }
    }

    animationId = requestAnimationFrame(onPlay);
  }

  function onBlinkDetected() {
    totalBlinks++;
    if (piscasEl) piscasEl.innerText = `✅ Piscou! Total: ${totalBlinks}`;
    // dispara evento público para UI (indica que houve piscada)
    try {
      document.dispatchEvent(new CustomEvent('blink:detected', { detail: { totalBlinks } }));
    } catch (e) { /* silencioso */ }

    // comportamento original: tenta acionar seleção por piscada
    if (typeof window.selecionarTeclaAtual === 'function') window.selecionarTeclaAtual();
    else if (typeof window.selecionarTeclaNumpadAtual === 'function') window.selecionarTeclaNumpadAtual();
  }

  // --- camera / models lifecycle ---
  async function loadModelsIfNeeded() {
    if (modelsLoaded) return;
    if (typeof faceapi === 'undefined') {
      // faceapi não estava carregado; try load it from libs
      try {
        await loadScriptURL(LIBS_FACEAPI);
      } catch (err) {
        throw new Error('face-api não carregado e não foi possível carregar a biblioteca: ' + (err && err.message));
      }
    }
    if (typeof faceapi === 'undefined') {
      throw new Error('faceapi não disponível após tentativa de carregamento.');
    }

    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_BASE),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_BASE)
      ]);
      modelsLoaded = true;
      log('modelos carregados de', MODELS_BASE);
    } catch (err) {
      throw new Error('Falha ao carregar modelos face-api: ' + (err && err.message));
    }
  }

  async function startCameraAndModels() {
    if (!video) throw new Error('video element ausente');
    // carrega modelos (e faceapi se necessário)
    await loadModelsIfNeeded();

    // request camera
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: {} });
      video.srcObject = stream;
      // start will continue on 'playing' event
    } catch (err) {
      throw new Error('Erro ao acessar câmera: ' + (err && err.message));
    }

    return new Promise((resolve) => {
      const onPlaying = () => {
        try {
          video.removeEventListener('playing', onPlaying);
          if (canvas && video.videoWidth && video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx = canvas.getContext('2d');
          }
          playing = true;
          if (!animationId) animationId = requestAnimationFrame(onPlay);
        } catch (e) { }
        resolve();
      };
      video.addEventListener('playing', onPlaying);
    });
  }

  function stopCameraAndLoop() {
    playing = false;
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    if (stream) {
      try {
        stream.getTracks().forEach(t => t.stop());
      } catch (e) { }
      stream = null;
    }
    // limpa canvas
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // --- UI controls wiring (init only sets up references and handlers) ---
  function wireControls() {
    // elements may or may not exist depending on UI
    piscasEl = document.getElementById('piscas') || null;

    thrDec = document.getElementById('thr-dec');
    thrInc = document.getElementById('thr-inc');
    framesDec = document.getElementById('frm-dec');
    framesInc = document.getElementById('frm-inc');
    debDec = document.getElementById('deb-dec');
    debInc = document.getElementById('deb-inc');

    thrValSpan = document.getElementById('threshold-val');
    framesValSpan = document.getElementById('frames-val');
    debounceValSpan = document.getElementById('debounce-val');

    detBtn = document.getElementById('toggle-detection');

    updateDisplays();

    if (thrDec) thrDec.addEventListener('click', () => {
      EAR_THRESHOLD = Math.max(0, roundToStep(EAR_THRESHOLD - 0.001, 0.001));
      updateDisplays();
    });
    if (thrInc) thrInc.addEventListener('click', () => {
      EAR_THRESHOLD = Math.min(1, roundToStep(EAR_THRESHOLD + 0.001, 0.001));
      updateDisplays();
    });

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

    if (debDec) debDec.addEventListener('click', () => {
      DEBOUNCE_AFTER_BLINK = Math.max(0, roundToStep(DEBOUNCE_AFTER_BLINK - 0.5, 0.5));
      updateDisplays();
    });
    if (debInc) debInc.addEventListener('click', () => {
      DEBOUNCE_AFTER_BLINK = roundToStep(DEBOUNCE_AFTER_BLINK + 0.5, 0.5);
      updateDisplays();
    });

    if (detBtn) {
      // initial
      detBtn.setAttribute('data-detection-active', String(detectionEnabled));
      detBtn.textContent = detectionEnabled ? 'Desativar detecção' : 'Ativar detecção';
      detBtn.onclick = () => {
        const cur = detBtn.getAttribute('data-detection-active') === 'true';
        const next = !cur;
        detBtn.setAttribute('data-detection-active', String(next));
        detBtn.textContent = next ? 'Desativar detecção' : 'Ativar detecção';
        document.dispatchEvent(new CustomEvent('detection:toggled', { detail: { active: next } }));
      };
    }

    // external toggle support
    document.addEventListener('detection:toggled', (ev) => {
      try {
        const active = !!(ev && ev.detail && ev.detail.active);
        detectionEnabled = active;
        if (piscasEl) {
          if (detectionEnabled) piscasEl.innerText = `Detecção ativada — Total de piscadas: ${totalBlinks}`;
          else piscasEl.innerText = `Detecção desativada — Total de piscadas: ${totalBlinks}`;
        }
        earBelowFrames = 0; earAboveFrames = 0; blinkInProgress = false; debounceFrames = 0;
      } catch (err) {
        console.warn('Erro ao processar detection:toggled:', err);
      }
    });
  }

  // --- Public API object (exposed as window.BlinkDetection) ---
  const BlinkDetection = {
    async init(opts = {}) {
      // populate refs
      video = document.getElementById('videoEl') || document.querySelector('video#videoEl');
      canvas = document.getElementById('overlay') || document.querySelector('canvas#overlay');

      if (canvas) {
        ctx = canvas.getContext ? canvas.getContext('2d') : null;
      }

      wireControls();

      // re-run wireControls() caso os elementos apareçam depois (robustez)
      try {
        const rootObserve = document.getElementById('keyboard-panel') || document.body;
        const mo = new MutationObserver((mutations) => {
          // se já temos os elementos essenciais, re-wire e desconecta
          if (document.getElementById('threshold-val') || document.getElementById('thr-dec') || document.getElementById('frm-dec')) {
            try { wireControls(); } catch (e) { log('wireControls re-run falhou', e); }
            mo.disconnect();
            log('BlinkDetection: controles detectados dinamicamente -> wireControls reaplicado');
          }
        });
        mo.observe(rootObserve, { childList: true, subtree: true });
      } catch (err) {
        log('BlinkDetection: observer não pôde ser criado', err);
      }

      // read params if present in DOM
      const thrSpan = document.getElementById('threshold-val');
      if (thrSpan && thrSpan.innerText) EAR_THRESHOLD = parseFloat(thrSpan.innerText) || EAR_THRESHOLD;
      const framesSpan = document.getElementById('frames-val');
      if (framesSpan && framesSpan.innerText) EAR_CONSEC_FRAMES = parseFloat(framesSpan.innerText) || EAR_CONSEC_FRAMES;
      const debSpan = document.getElementById('debounce-val');
      if (debSpan && debSpan.innerText) DEBOUNCE_AFTER_BLINK = parseFloat(debSpan.innerText) || DEBOUNCE_AFTER_BLINK;

      updateDisplays();

      // do not start camera automatically here — UI should call startCamera()
      running = false;
      return true;
    },

    async startCamera() {
      if (running) return;
      try {
        await startCameraAndModels();
        running = true;
        log('BlinkDetection: camera started');
      } catch (err) {
        // propagate error for UI handling
        throw err;
      }
    },

    stop() {
      stopCameraAndLoop();
      running = false;
      log('BlinkDetection: stopped');
    },

    isRunning() { return running; },

    // convenience accessors for debugging
    getStats() { return { totalBlinks, running, modelsLoaded, faceapiLoaded } }
  };
  // export
  window.BlinkDetection = BlinkDetection;

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // If you want the old behavior (auto init/start), uncomment below:
    // (async () => { try { await BlinkDetection.init(); await BlinkDetection.startCamera(); } catch(e){ console.warn('auto start fail:', e); } })();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      // do not auto-start camera — just init wiring so UI may call startCamera()
      BlinkDetection.init().catch(err => log('init error:', err));
    });
  }

})();