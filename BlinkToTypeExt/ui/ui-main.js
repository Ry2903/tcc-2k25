// ui-main.js - VERSÃO FINAL PARA EXTENSÃO CHROME
(function () {
  'use strict';
  window.__kb_debug = true; // ← ATIVA LOGS
  const LOG = (...args) => console.log('[UI]', ...args);

  const WELCOME_ID = 'welcome';
  const MAIN_ID = 'main';
  const CAMERA_SETUP_ID = 'camera-setup';
  const BTN_START_ID = 'btn-start';
  const BTN_CLOSE_ID = 'btn-close';

  function $id(id) { return document.getElementById(id); }

  // ========== GERENCIAMENTO DE TELAS ==========
  function showWelcome() {
    LOG('📱 Mostrando welcome');
    [$id(MAIN_ID), $id(CAMERA_SETUP_ID)].forEach(el => {
      if (el) {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    });
    const w = $id(WELCOME_ID);
    if (w) {
      w.classList.remove('hidden');
      w.setAttribute('aria-hidden', 'false');
    }
  }

  function showMain() {
    LOG('⌨️ Mostrando teclado');
    [$id(WELCOME_ID), $id(CAMERA_SETUP_ID)].forEach(el => {
      if (el) {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    });
    const m = $id(MAIN_ID);
    if (m) {
      m.classList.remove('hidden');
      m.setAttribute('aria-hidden', 'false');
    }
  }

  function hideCameraSetup() {
    const cs = $id(CAMERA_SETUP_ID);
    if (cs) {
      cs.classList.add('hidden');
      cs.setAttribute('aria-hidden', 'true');
    }
    showMain();
  }

  // ========== CRIAR TELA DE CÂMERA DINAMICAMENTE ==========
  function createCameraSetup() {
    LOG('📸 Criando tela de câmera');
    
    let cs = $id(CAMERA_SETUP_ID);
    if (cs) {
      LOG('⚠️ Removendo camera-setup antigo');
      cs.remove();
    }

    cs = document.createElement('div');
    cs.id = CAMERA_SETUP_ID;
    cs.className = 'hidden';
    cs.setAttribute('aria-hidden', 'true');

    // Criar estrutura
    const card = document.createElement('div');
    card.className = 'card camera-card';
    card.style.cssText = 'max-width: 600px; margin: 20px auto; padding: 20px; background: var(--panel-color); border-radius: 8px;';

    const h2 = document.createElement('h2');
    h2.textContent = 'Configuração da Câmera';
    h2.style.cssText = 'color: #fff; margin-bottom: 15px;';
    card.appendChild(h2);

    // Container de vídeo
    const videoContainer = document.createElement('div');
    videoContainer.style.cssText = 'position: relative; width: 360px; height: 240px; margin: 0 auto 15px;';

    const video = document.createElement('video');
    video.id = 'videoEl';
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = 'width: 360px; height: 240px; border-radius: 6px; background: #000;';

    const canvas = document.createElement('canvas');
    canvas.id = 'overlay';
    canvas.width = 360;
    canvas.height = 240;
    canvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 360px; height: 240px; pointer-events: none;';

    videoContainer.appendChild(video);
    videoContainer.appendChild(canvas);
    card.appendChild(videoContainer);

    // Container de controles
    const controlsRow = document.createElement('div');
    controlsRow.style.cssText = 'display: flex; gap: 10px; margin-bottom: 15px; justify-content: center;';

    // Indicador de piscada
    const indicatorCol = document.createElement('div');
    indicatorCol.style.cssText = 'text-align: center;';

    const blinkInd = document.createElement('div');
    blinkInd.id = 'blink-indicator';
    blinkInd.style.cssText = 'width: 48px; height: 48px; border-radius: 50%; background: #2f3b45; margin: 0 auto 8px; transition: background 0.12s;';
    indicatorCol.appendChild(blinkInd);

    const piscas = document.createElement('div');
    piscas.id = 'piscas';
    piscas.textContent = 'Total: 0';
    piscas.style.cssText = 'color: #8ED4FF; font-size: 14px; font-weight: 700;';
    indicatorCol.appendChild(piscas);

    controlsRow.appendChild(indicatorCol);

    // Controles de ajuste
    const adjustCol = document.createElement('div');
    adjustCol.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: #ccc;';

    const controls = [
      { id: 'threshold', label: 'Threshold', value: '0.279', dec: 'thr-dec', inc: 'thr-inc' },
      { id: 'frames', label: 'Frames', value: '1.5', dec: 'frm-dec', inc: 'frm-inc' },
      { id: 'debounce', label: 'Debounce', value: '1.0', dec: 'deb-dec', inc: 'deb-inc' }
    ];

    controls.forEach(ctrl => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(142, 212, 255, 0.1); padding: 6px 10px; border-radius: 4px;';

      const label = document.createElement('strong');
      label.textContent = ctrl.label + ':';
      row.appendChild(label);

      const btnGroup = document.createElement('div');
      btnGroup.style.cssText = 'display: flex; gap: 8px; align-items: center;';

      const decBtn = document.createElement('button');
      decBtn.id = ctrl.dec;
      decBtn.textContent = '-';
      decBtn.style.cssText = 'width: 28px; height: 28px; border: none; border-radius: 4px; background: var(--button-bg); cursor: pointer; font-weight: 700;';

      const val = document.createElement('span');
      val.id = ctrl.id + '-val';
      val.textContent = ctrl.value;
      val.style.cssText = 'min-width: 50px; text-align: center; font-weight: 700;';

      const incBtn = document.createElement('button');
      incBtn.id = ctrl.inc;
      incBtn.textContent = '+';
      incBtn.style.cssText = 'width: 28px; height: 28px; border: none; border-radius: 4px; background: var(--button-bg); cursor: pointer; font-weight: 700;';

      btnGroup.appendChild(decBtn);
      btnGroup.appendChild(val);
      btnGroup.appendChild(incBtn);
      row.appendChild(btnGroup);
      adjustCol.appendChild(row);
    });

    controlsRow.appendChild(adjustCol);
    card.appendChild(controlsRow);

    // Botões de ação
    const actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display: flex; gap: 10px; justify-content: center;';

    const startBtn = document.createElement('button');
    startBtn.id = 'start-camera';
    startBtn.className = 'primary';
    startBtn.textContent = 'Iniciar Câmera';
    startBtn.style.cssText = 'padding: 10px 20px; border: none; border-radius: 6px; background: var(--button-bg); color: #000; font-weight: 700; cursor: pointer;';

    const stopBtn = document.createElement('button');
    stopBtn.id = 'stop-camera';
    stopBtn.className = 'secondary';
    stopBtn.textContent = 'Parar';
    stopBtn.style.cssText = 'padding: 10px 20px; border: none; border-radius: 6px; background: rgba(255,255,255,0.1); color: #fff; cursor: pointer;';

    const continueBtn = document.createElement('button');
    continueBtn.id = 'continue-to-ui';
    continueBtn.textContent = 'Continuar →';
    continueBtn.style.cssText = 'padding: 10px 20px; border: none; border-radius: 6px; background: #166534; color: #fff; font-weight: 700; cursor: pointer;';

    actionsRow.appendChild(startBtn);
    actionsRow.appendChild(stopBtn);
    actionsRow.appendChild(continueBtn);
    card.appendChild(actionsRow);

    // Help text
    const help = document.createElement('p');
    help.textContent = 'Ajuste os parâmetros até o indicador piscar quando você piscar os olhos';
    help.style.cssText = 'margin-top: 15px; font-size: 12px; color: #999; text-align: center;';
    card.appendChild(help);

    cs.appendChild(card);
    document.body.insertBefore(cs, $id(MAIN_ID));
    
    LOG('✅ Camera setup criado com elementos:', {
      video: !!$id('videoEl'),
      canvas: !!$id('overlay')
    });
    
    return cs;
  }

  // ========== INICIALIZAR CÂMERA ==========
  async function initCameraSetup() {
    LOG('🎬 Inicializando camera setup');
    
    const cs = $id(CAMERA_SETUP_ID);
    if (!cs) {
      LOG('❌ Camera setup não encontrado');
      return;
    }

    const video = $id('videoEl');
    const canvas = $id('overlay');
    const piscasEl = $id('piscas');
    const blinkInd = $id('blink-indicator');
    const startBtn = $id('start-camera');
    const stopBtn = $id('stop-camera');
    const continueBtn = $id('continue-to-ui');

    LOG('✅ Elementos encontrados:', { 
      video: !!video, 
      canvas: !!canvas, 
      piscas: !!piscasEl,
      startBtn: !!startBtn 
    });

    // Listener de piscadas
    document.addEventListener('blink:detected', (e) => {
      LOG('👁️ PISCADA!', e.detail);
      if (blinkInd) {
        blinkInd.style.background = '#4ade80';
        setTimeout(() => { blinkInd.style.background = '#2f3b45'; }, 150);
      }
      if (piscasEl) {
        piscasEl.textContent = `Total: ${e.detail.totalBlinks}`;
      }
    });

    // Botão START
    if (startBtn) {
      startBtn.onclick = async () => {
        try {
          startBtn.disabled = true;
          startBtn.textContent = 'Iniciando...';
          LOG('▶️ Iniciando câmera');

          // Verifica elementos
          if (!video || !canvas) {
            throw new Error('Elementos video/canvas não encontrados!');
          }

          LOG('🔧 Elementos OK');
          LOG('🔧 BlinkDetection disponível?', !!window.BlinkDetection);

          // Inicializa BlinkDetection
          if (!window.BlinkDetection) {
            throw new Error('BlinkDetection não carregado! Verifique se script.js foi carregado.');
          }

          LOG('⚙️ Chamando BlinkDetection.init()...');
          await window.BlinkDetection.init();
          LOG('✅ BlinkDetection.init() OK');

          LOG('📹 Chamando BlinkDetection.startCamera()...');
          await window.BlinkDetection.startCamera();
          LOG('✅ Câmera iniciada com sucesso!');

          startBtn.textContent = '✓ Câmera Ativa';
          startBtn.style.background = '#166534';
          startBtn.style.color = '#fff';
          
          if (piscasEl) {
            piscasEl.textContent = '✓ Câmera ativa - pisque!';
            piscasEl.style.color = '#4ade80';
          }

        } catch (err) {
          console.error('❌ ERRO AO INICIAR CÂMERA:', err);
          console.error('Stack:', err.stack);
          alert('Erro ao iniciar câmera:\n\n' + err.message + '\n\nVeja o console (F12) para mais detalhes.');
          startBtn.textContent = 'Tentar Novamente';
          startBtn.disabled = false;
          startBtn.style.background = '';
          startBtn.style.color = '';
        }
      };
    }

    // Botão STOP
    if (stopBtn) {
      stopBtn.onclick = () => {
        try {
          if (window.BlinkDetection) {
            window.BlinkDetection.stop();
            LOG('⏹️ Câmera parada');
            if (startBtn) {
              startBtn.textContent = 'Iniciar Câmera';
              startBtn.disabled = false;
              startBtn.style.background = '';
              startBtn.style.color = '';
            }
          }
        } catch (e) {
          console.error('Erro ao parar:', e);
        }
      };
    }

    // Botão CONTINUE
    if (continueBtn) {
      continueBtn.onclick = () => {
        LOG('➡️ Continuando para teclado');
        hideCameraSetup();
        initKeyboard();
      };
    }

    LOG('✅ Camera setup listeners configurados');
  }

  // ========== INICIALIZAR TECLADO ==========
  function initKeyboard() {
    LOG('⌨️ Inicializando teclado');
    
    try {
      if (window.setActivePanel) {
        window.setActivePanel('keyboard');
        LOG('✅ setActivePanel OK');
      }
      if (window.resetSelection) {
        window.resetSelection();
        LOG('✅ resetSelection OK');
      }
    } catch (e) {
      LOG('⚠️ Erro ao inicializar teclado:', e);
    }
  }

  // ========== MOSTRAR TELA DE CÂMERA ==========
  async function showCameraSetup() {
    LOG('📸 showCameraSetup iniciado');
    
    // Esconde outras telas
    [$id(WELCOME_ID), $id(MAIN_ID)].forEach(el => {
      if (el) {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    });

    // Cria e mostra camera setup
    createCameraSetup();
    const cs = $id(CAMERA_SETUP_ID);
    if (cs) {
      cs.classList.remove('hidden');
      cs.setAttribute('aria-hidden', 'false');
    }

    // Aguarda DOM renderizar
    await new Promise(resolve => requestAnimationFrame(resolve));

    LOG('📸 DOM renderizado, inicializando controles');
    
    // Inicializa controles
    initCameraSetup();
  }

  // ========== BIND BOTÕES INICIAIS ==========
  function bindButtons() {
    const startBtn = $id(BTN_START_ID);
    const closeBtn = $id(BTN_CLOSE_ID);

    if (startBtn) {
      startBtn.onclick = () => {
        LOG('🚀 Botão Iniciar clicado');
        showCameraSetup();
      };
      LOG('✅ Botão start bound');
    }

    if (closeBtn) {
      closeBtn.onclick = () => {
        try { window.close(); } catch (e) {}
      };
    }
  }

  // ========== BOOT ==========
  LOG('🎬 UI-MAIN.JS CARREGADO');
  LOG('🎬 Document readyState:', document.readyState);
  LOG('🎬 BlinkDetection disponível?', !!window.BlinkDetection);
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      LOG('📄 DOMContentLoaded event');
      bindButtons();
      showWelcome();
    });
  } else {
    LOG('📄 DOM já carregado, executando imediatamente');
    bindButtons();
    showWelcome();
  }

  // Export para debug
  window.__ui_debug = {
    showCameraSetup,
    hideCameraSetup,
    createCameraSetup,
    initCameraSetup,
    initKeyboard,
    showWelcome,
    showMain
  };

})();