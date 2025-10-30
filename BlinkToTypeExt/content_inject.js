(function(){
  try {
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
      width: '600px',   // largura aumentada (retangular)
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
      cursor: 'pointer'
    });
    closeBtn.addEventListener('click', () => root.remove());

    root.appendChild(iframe);
    root.appendChild(closeBtn);
    document.documentElement.appendChild(root);

    window.addEventListener('message', function onMsg(ev){
      if(!ev || !ev.data) return;
      if(ev.data && ev.data.type === 'blink:close'){
        const r = document.getElementById('blink-extension-root');
        if(r) r.remove();
      }
    }, false);

    console.log('[Blink] overlay injetado com iframe ->', iframe.src);
  } catch (err) {
    console.error('[Blink] content_inject erro:', err);
  }
})();