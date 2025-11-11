(function () {
  try {
    // Evita múltiplas injeções
    const EXISTING = document.getElementById('blink-extension-root');
    if (EXISTING) {
      console.log('[Blink] Extensão já injetada, ignorando...');
      return;
    }

    // Notifica background que extensão foi aberta
    try {
      chrome.runtime.sendMessage({ type: 'extension-opened' });
    } catch (e) {
      console.warn('[Blink] Não conseguiu notificar background:', e);
    }

    const root = document.createElement('div');
    root.id = 'blink-extension-root';
    Object.assign(root.style, {
      position: 'fixed',
      right: '10px',
      bottom: '10px',
      width: '600px',
      height: '360px',
      zIndex: 2147483647,
      boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
      borderRadius: '8px',
      overflow: 'hidden',
      background: 'transparent'
    });

    const iframe = document.createElement('iframe');
    iframe.src = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('ui/ui.html')
      : 'ui/ui.html';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
    iframe.id = 'blink-extension-iframe';
    iframe.allow = 'camera; microphone; autoplay; clipboard-read; clipboard-write';

    // Botão fechar
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
    closeBtn.addEventListener('click', () => {
      root.remove();
      // Notifica background que foi fechado
      try {
        chrome.runtime.sendMessage({ type: 'remove-overlay' });
      } catch (e) { }
    });

    root.appendChild(iframe);
    root.appendChild(closeBtn);
    document.documentElement.appendChild(root);

    // Escuta mensagens vindas do iframe
    window.addEventListener('message', function onMsg(ev) {
      if (!ev || !ev.data) return;

      const d = ev.data;

      if (d.type === 'blink:close') {
        const r = document.getElementById('blink-extension-root');
        if (r) r.remove();
        try {
          chrome.runtime.sendMessage({ type: 'remove-overlay' });
        } catch (e) { }
        return;
      }

      if (d.type === 'blink:requestInputs') {
        try {
          const candidates = Array.from(document.querySelectorAll(
            'input[type="text"], input[type="search"], input:not([type]), textarea, [contenteditable="true"]'
          ));

          const visible = candidates.filter(el => {
            try {
              if (el.disabled) return false;
              const style = window.getComputedStyle(el);
              if (style && (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0)) return false;
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) return false;
              return true;
            } catch (e) { return false; }
          });

          const inputs = visible.map((el, idx) => {
            const rect = el.getBoundingClientRect();
            return {
              index: idx,
              tag: el.tagName.toLowerCase(),
              type: el.getAttribute('type') || null,
              name: el.getAttribute('name') || null,
              placeholder: el.getAttribute('placeholder') || '',
              valuePreview: (el.value || (el.textContent && el.textContent.slice(0, 40)) || '').toString().slice(0, 40),
              rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
            };
          });

          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'blink:inputs', inputs }, '*');
          }
        } catch (err) {
          console.error('[Blink] requestInputs handler failed', err);
        }
        return;
      }

      if (d.type === 'blink:focusInput') {
        try {
          const idx = parseInt(d.index, 10);
          if (isNaN(idx)) return;
          
          const candidates = Array.from(document.querySelectorAll(
            'input[type="text"], input[type="search"], input:not([type]), textarea, [contenteditable="true"]'
          ));
          
          const visible = candidates.filter(el => {
            try {
              if (el.disabled) return false;
              const style = window.getComputedStyle(el);
              if (style && (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0)) return false;
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) return false;
              return true;
            } catch (e) { return false; }
          });

          const el = visible[idx];
          if (el) {
            try { el.focus({ preventScroll: false }); } catch (e) { try { el.focus(); } catch (_) { } }
            try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { }
            const prev = el.style.boxShadow;
            el.style.boxShadow = '0 0 0 3px rgba(0,200,255,0.45)';
            setTimeout(() => { el.style.boxShadow = prev || ''; }, 800);
          }
        } catch (err) {
          console.error('[Blink] focusInput handler failed', err);
        }
        return;
      }

      if (d.type === 'blink:insertAction' || d.type === 'blink:insertText') {
        try {
          let el = document.activeElement;
          
          if (d.index !== undefined && d.index !== null) {
            const candidates = Array.from(document.querySelectorAll(
              'input[type="text"], input[type="search"], input:not([type]), textarea, [contenteditable="true"]'
            ));
            const visible = candidates.filter(elm => {
              try {
                if (elm.disabled) return false;
                const style = window.getComputedStyle(elm);
                if (style && (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0)) return false;
                const rect = elm.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) return false;
                return true;
              } catch (e) { return false; }
            });
            el = visible[parseInt(d.index, 10)] || el;
          }

          if (!el) {
            console.warn('[Blink] Nenhum elemento ativo encontrado');
            return;
          }

          // ENTER
          if (d.action === 'enter') {
            console.log('[Blink] 🔵 Processando ENTER no elemento:', el.tagName, el.type);

            if (el.form) {
              const form = el.form;
              const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
              
              if (submitBtn) {
                console.log('[Blink] ✅ Clicando em botão submit');
                submitBtn.click();
                return;
              }

              try {
                console.log('[Blink] ✅ Submetendo form diretamente');
                form.submit();
                return;
              } catch (e) {
                const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                if (form.dispatchEvent(submitEvent)) {
                  console.log('[Blink] ✅ Submit event disparado');
                  return;
                }
              }
            }

            ['keydown', 'keypress', 'keyup'].forEach(eventType => {
              const enterEvent = new KeyboardEvent(eventType, {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                charCode: 13,
                bubbles: true,
                cancelable: true,
                composed: true
              });
              el.dispatchEvent(enterEvent);
            });

            console.log('[Blink] ✅ Enter KeyboardEvents disparados');

            if (el.type === 'search' || el.getAttribute('role') === 'searchbox') {
              const searchBtn = document.querySelector('button[type="submit"], button[aria-label*="earch" i], button[aria-label*="uscar" i]');
              if (searchBtn) {
                console.log('[Blink] ✅ Clicando em botão de busca');
                searchBtn.click();
              }
            }
            return;
          }

          // BACKSPACE
          if (d.action === 'backspace') {
            if (el.tagName && (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea')) {
              const start = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd ?? start;
              if (start === end && start > 0) {
                el.value = el.value.slice(0, start - 1) + el.value.slice(end);
                el.setSelectionRange(start - 1, start - 1);
              } else {
                el.value = el.value.slice(0, start) + el.value.slice(end);
                el.setSelectionRange(start, start);
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (el.isContentEditable) {
              const sel = window.getSelection();
              if (sel && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                if (range.collapsed) {
                  range.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
                  range.deleteContents();
                } else {
                  range.deleteContents();
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
            return;
          }

          // CLEAR ALL
          if (d.action === 'clearAll' || d.action === 'clear') {
            if (el.tagName && (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea')) {
              el.value = '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (el.isContentEditable) {
              el.innerText = '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
          }

          // INSERT TEXT
          if (d.type === 'blink:insertText' && typeof d.text === 'string') {
            const text = d.text || '';
            if (el.tagName && (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea')) {
              const start = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd ?? start;
              el.value = el.value.slice(0, start) + text + el.value.slice(end);
              const pos = start + text.length;
              el.setSelectionRange(pos, pos);
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (el.isContentEditable) {
              try {
                el.focus();
                const sel = window.getSelection();
                if (sel && sel.getRangeAt && sel.rangeCount) {
                  const range = sel.getRangeAt(0);
                  range.deleteContents();
                  range.insertNode(document.createTextNode(text));
                  range.setStartAfter(range.endContainer);
                  sel.removeAllRanges();
                  sel.addRange(range);
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                  el.innerText = (el.innerText || '') + text;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                }
              } catch (e) {
                el.innerText = (el.innerText || '') + text;
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
            
            try { el.focus({ preventScroll: false }); } catch (e) { try { el.focus(); } catch (_) { } }
            const prev = el.style.boxShadow;
            el.style.boxShadow = '0 0 0 3px rgba(0,200,255,0.25)';
            setTimeout(() => { el.style.boxShadow = prev || ''; }, 350);
            return;
          }
        } catch (err) {
          console.error('[Blink] insertAction handler failed', err);
        }
        return;
      }
    }, false);

    console.log('[Blink] ✅ Overlay injetado com iframe ->', iframe.src);
  } catch (err) {
    console.error('[Blink] content_inject erro:', err);
  }
})();