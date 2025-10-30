(function(){
  try {
    // Se já existe, remove (toggle)
    if (document.getElementById('blink-extension-root')) {
      document.getElementById('blink-extension-root').remove();
      return;
    }

    const root = document.createElement('div');
    root.id = 'blink-extension-root';
    Object.assign(root.style, {
      position: 'fixed',
      right: '10px',
      bottom: '10px',
      width: '600px',
      height: '370px',
      zIndex: 2147483647,
      boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
      borderRadius: '8px',
      overflow: 'hidden',
      background: 'transparent'
    });

    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('ui/ui.html');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
    iframe.id = 'blink-extension-iframe';
    
    // 🎯 CORREÇÃO CRÍTICA: Permissões para câmera e microfone
    iframe.setAttribute('allow', 'camera; microphone');
    // Adiciona também sandbox permissivo (necessário em alguns casos)
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms');

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      position: 'absolute',
      right: '6px',
      top: '6px',
      zIndex: 2147483650,
      background: 'rgba(0,0,0,0.4)',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      padding: '4px 6px',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: 'bold'
    });
    closeBtn.addEventListener('click', () => root.remove());

    root.appendChild(iframe);
    root.appendChild(closeBtn);
    document.documentElement.appendChild(root);

    // Listener para mensagens do iframe
    window.addEventListener('message', function onMsg(ev){
      if(!ev || !ev.data) return;
      if(ev.data && ev.data.type === 'blink:close'){
        const r = document.getElementById('blink-extension-root');
        if(r) r.remove();
      }
      // Listener para resize (se o iframe pedir para ajustar tamanho)
      if(ev.data && ev.data.type === 'blink:resize' && ev.data.height){
        const h = Math.min(Math.max(ev.data.height, 370), 600); // entre 370px e 600px
        root.style.height = h + 'px';
      }
    }, false);

    console.log('[Blink] ✅ Overlay injetado com permissões de câmera ->', iframe.src);
  } catch (err) {
    console.error('[Blink] ❌ content_inject erro:', err);
  }
})();