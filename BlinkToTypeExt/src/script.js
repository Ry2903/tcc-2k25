(function () {
  'use strict';
  // --- DOM refs (populated in init) ---
  let video = null;
  let canvas = null;
  let ctx = null;
  let piscasEl = null;
  let thrDec = null, thrInc = null, framesDec = null, framesInc = null, debDec = null, debInc = null;

  // --- state ---
  let stream = null;
  let animationId = null;
  let playing = false;
  let detectionEnabled = true;
  let showVideoInCanvas = true;

  // EAR / blink thresholds (padrões)
  let EAR_THRESHOLD = 0.279;
  let EAR_CONSEC_FRAMES = 1.5;
  let EAR_REOPEN_FRAMES = 1.5;
  let DEBOUNCE_AFTER_BLINK = 2; // frames

  // contadores temporários
  let earBelowFrames = 0;
  let earAboveFrames = 0;
  let debounceFrames = 0;
  let blinkInProgress = false;
  let totalBlinks = 0;

  // util logs
  function log(...args) { try { console.log('[BlinkDetection]', ...args); } catch (e) { } }

  // --- helpers EAR ---
  function getEAR(eye) {
    // eye expected as array of points [{x,y},...6]
    if (!eye || eye.length < 6) return 0;
    function dist(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.hypot(dx, dy);
    }
    const A = dist(eye[1], eye[5]);
    const B = dist(eye[2], eye[4]);
    const C = dist(eye[0], eye[3]) || 1e-6;
    return (A + B) / (2.0 * C);
  }

  // --- UI wiring ---
  function wireControls() {
    piscasEl = document.getElementById('piscas');
    thrDec = document.getElementById('thr-dec');
    thrInc = document.getElementById('thr-inc');
    framesDec = document.getElementById('frm-dec');
    framesInc = document.getElementById('frm-inc');
    debDec = document.getElementById('deb-dec');
    debInc = document.getElementById('deb-inc');

    if (thrDec) thrDec.onclick = () => {
      EAR_THRESHOLD = Math.max(0.05, EAR_THRESHOLD - 0.01);
      const el = document.getElementById('threshold-val'); if (el) el.textContent = EAR_THRESHOLD.toFixed(3);
    };
    if (thrInc) thrInc.onclick = () => {
      EAR_THRESHOLD = Math.min(0.5, EAR_THRESHOLD + 0.01);
      const el = document.getElementById('threshold-val'); if (el) el.textContent = EAR_THRESHOLD.toFixed(3);
    };
    if (framesDec) framesDec.onclick = () => {
      EAR_CONSEC_FRAMES = Math.max(1, EAR_CONSEC_FRAMES - 0.1);
      const el = document.getElementById('frames-val'); if (el) el.textContent = EAR_CONSEC_FRAMES;
    };
    if (framesInc) framesInc.onclick = () => {
      EAR_CONSEC_FRAMES = Math.min(6, EAR_CONSEC_FRAMES + 0.1);
      const el = document.getElementById('frames-val'); if (el) el.textContent = EAR_CONSEC_FRAMES;
    };
    if (debDec) debDec.onclick = () => {
      DEBOUNCE_AFTER_BLINK = Math.max(0, DEBOUNCE_AFTER_BLINK - 0.1);
      const el = document.getElementById('debounce-val'); if (el) el.textContent = (DEBOUNCE_AFTER_BLINK / 1000).toFixed(2);
    };
    if (debInc) debInc.onclick = () => {
      DEBOUNCE_AFTER_BLINK = Math.min(100, DEBOUNCE_AFTER_BLINK + 0.1);
      const el = document.getElementById('debounce-val'); if (el) el.textContent = (DEBOUNCE_AFTER_BLINK / 1000).toFixed(2);
    };

    // detection toggle (text-only button in your index)
    const detBtn = document.getElementById('toggle-detection');
    if (detBtn) {
      detBtn.textContent = 'Detecção';
      detBtn.classList.remove('active');
      detBtn.setAttribute('data-detection-active', 'true');
      detBtn.onclick = () => {
        const cur = detBtn.getAttribute('data-detection-active') === 'true';
        detBtn.setAttribute('data-detection-active', String(!cur));
        detectionEnabled = !cur;
        document.dispatchEvent(new CustomEvent('detection:toggled', { detail: { active: !cur } }));
      };
    }

    // keyboard/numpad toggles are present in index; we wire them but do not create duplicates
    const kbBtn = document.getElementById('toggle-keyboard');
    const npBtn = document.getElementById('toggle-numpad');
    if (kbBtn) kbBtn.onclick = () => {
      if (typeof window.setModo === 'function') window.setModo('keyboard');
      if (kbBtn) kbBtn.classList.add('active');
      if (npBtn) npBtn.classList.remove('active');
    };
    if (npBtn) npBtn.onclick = () => {
      if (typeof window.setModo === 'function') window.setModo('numpad');
      if (npBtn) npBtn.classList.add('active');
      if (kbBtn) kbBtn.classList.remove('active');
    };
  }

  // --- core functions (camera setup / models) ---
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  async function loadModels() {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('../models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('../models')
    ]);
  }

  // --- antiga função onPlay adaptada: NÃO DEPENDE DO CANVAS/CTX para rodar ----
  async function onPlay() {
    // continue loop as long as playing and video exists; do NOT depend on canvas/context existing.
    if (!playing || !video) {
      animationId = requestAnimationFrame(onPlay);
      return;
    }

    let detection = null;
    try {
      detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
    } catch (err) {
      log('face-api detect erro:', err);
    }

    // If ctx exists and showVideoInCanvas requested, draw video into canvas
    if (ctx && canvas && showVideoInCanvas) {
      try {
        // ensure canvas matches video size before drawing
        if (video.videoWidth && video.videoHeight && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx = canvas.getContext('2d');
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch (e) {
        log('Erro ao desenhar no canvas:', e);
      }
    }

    // If there is a detection and detection is enabled, process landmarks and blinking.
    if (detection && detectionEnabled) {
      try {
        // Determine the reference size for drawing/resizeResults:
        const refWidth = (canvas && canvas.width) ? canvas.width : (video.videoWidth || video.clientWidth || 640);
        const refHeight = (canvas && canvas.height) ? canvas.height : (video.videoHeight || video.clientHeight || 480);
        const resized = faceapi.resizeResults(detection, { width: refWidth, height: refHeight });

        // Draw detections/landmarks only if we have a canvas/context
        if (ctx && canvas && faceapi.draw && typeof faceapi.draw.drawDetections === 'function') {
          try {
            faceapi.draw.drawDetections(canvas, resized);
            faceapi.draw.drawFaceLandmarks(canvas, resized);
          } catch (drawErr) {
            // drawing shouldn't block detection
            console.warn('draw error:', drawErr);
          }
        }

        const lm = detection.landmarks;
        const leftEAR = getEAR(lm.getLeftEye());
        const rightEAR = getEAR(lm.getRightEye());
        const avgEAR = (leftEAR + rightEAR) / 2;

        if (debounceFrames > 0) {
          debounceFrames--;
          animationId = requestAnimationFrame(onPlay);
          return;
        }

        if (avgEAR < EAR_THRESHOLD) {
          earBelowFrames++;
          earAboveFrames = 0;
          if (!blinkInProgress && earBelowFrames >= EAR_CONSEC_FRAMES) {
            blinkInProgress = true;
          }
        } else {
          earAboveFrames++;
          earBelowFrames = 0;
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
      // sem detection: opcionalmente apagar overlay se existir
      if (ctx && canvas) {
        try {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        } catch (e) { /* ignora */ }
      }
    }

    // schedule next frame
    animationId = requestAnimationFrame(onPlay);
  }

  function onBlinkDetected() {
    totalBlinks++;
    log('👁️ PISCADA DETECTADA! Total:', totalBlinks);

    if (piscasEl) {
      piscasEl.innerText = `✅ Piscou! Total: ${totalBlinks}`;
    }

    // dispara evento público para UI (indica que houve piscada)
    try {
      document.dispatchEvent(new CustomEvent('blink:detected', { detail: { totalBlinks } }));
    } catch (e) { /* silencioso */ }

    // Tenta acionar seleção do teclado (após continuar)
    try {
      if (typeof window.selecionarTeclaAtual === 'function') {
        window.selecionarTeclaAtual();
      } else if (typeof window.selecionarTeclaNumpadAtual === 'function') {
        window.selecionarTeclaNumpadAtual();
      }
    } catch (e) {
      log('Erro ao acionar seleção:', e);
    }
  }

  // camera setup / play
  async function startCamera(constraints = { video: { facingMode: 'user' }, audio: false }) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (video) {
        video.srcObject = stream;
        await video.play().catch(e => { /* autoplay block? */ });
      }
      return stream;
    } catch (err) {
      log('Erro ao iniciar camera:', err);
      throw err;
    }
  }

  function stopCameraAndLoop() {
    playing = false;
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    if (stream) {
      try {
        stream.getTracks().forEach(t => t.stop());
      } catch (e) { }
    }
    stream = null;
  }

  // helper para configurar canvas quando vídeo inicia
  function tryConfigureCanvas() {
    try {
      if (canvas && video && video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx = canvas.getContext('2d');
        log('✅ Canvas configurado:', canvas.width, 'x', canvas.height);
      }
    } catch (e) {
      console.warn('Falha ao configurar canvas:', e);
    }
  }


  const BlinkDetection = {
    // init: carrega libs/modelos e prepara refs, mas NÃO inicia a câmera
    async init(opts = {}) {
      log('🔧 Inicializando BlinkDetection (init) - preparando, sem iniciar câmera...');

      // populate refs
      video = document.getElementById('videoEl') || document.querySelector('video#videoEl');
      canvas = document.getElementById('overlay') || document.querySelector('canvas#overlay');

      log('Elementos encontrados no init:', { video: !!video, canvas: !!canvas });

      if (canvas) {
        ctx = canvas.getContext ? canvas.getContext('2d') : null;
      }

      wireControls();

      // re-run wireControls() caso os elementos apareçam depois (robustez)
      try {
        const rootObserve = document.getElementById('keyboard-panel') || document.body;
        const mo = new MutationObserver((mutations) => {
          if (!thrDec || !video) {
            thrDec = document.getElementById('thr-dec');
            thrInc = document.getElementById('thr-inc');
            framesDec = document.getElementById('frm-dec');
            framesInc = document.getElementById('frm-inc');
            debDec = document.getElementById('deb-dec');
            debInc = document.getElementById('deb-inc');
            piscasEl = document.getElementById('piscas');
            wireControls();
          }
        });
        mo.observe(rootObserve, { childList: true, subtree: true });
        setTimeout(() => mo.disconnect(), 60000); // desconecta depois de um tempo
      } catch (e) {
        /* silencioso */
      }

      // carregar faceapi e modelos
      await loadModels();

      // NÃO chamar startCamera() aqui — controlar a partir do UI
      log('✅ BlinkDetection.init() pronto (modelos carregados).');
      return true;
    },

    // startCamera: método público que inicia a câmera e o loop
    async startCamera(constraints = { video: { facingMode: 'user' }, audio: false }) {
      log('📹 BlinkDetection.startCamera() chamado (método público)...');
      // atualiza referências caso init() tenha sido chamado antes
      video = document.getElementById('videoEl') || video;
      canvas = document.getElementById('overlay') || canvas;
      if (canvas && !ctx) {
        ctx = canvas.getContext ? canvas.getContext('2d') : null;
      }

      // chama a função interna que faz getUserMedia e play
      try {
        await startCamera(constraints); // função interna definida no closure
        log('✅ startCamera interna completou. aguardando evento playing para iniciar loop.');
        // quando o vídeo der playing, o evento já configura playing=true e inicia loop
        // mas garantia: se já está playing, chamar onPlay
        if (video && !playing && !animationId && video.readyState >= 2) {
          playing = true;
          animationId = requestAnimationFrame(onPlay);
        }
        return true;
      } catch (err) {
        log('❌ startCamera falhou:', err);
        throw err;
      }
    },

    stop() {
      stopCameraAndLoop();
    },

    getState() {
      return {
        playing, detectionEnabled, totalBlinks
      };
    }
  };

  // export
  window.BlinkDetection = BlinkDetection;

  log('📦 BlinkDetection module loaded');

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // do not auto-init
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      log('📄 DOMContentLoaded - não iniciando automaticamente');
    });
  }

})();
