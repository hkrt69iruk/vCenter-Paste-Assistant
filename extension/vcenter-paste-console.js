// vCenter Paste Assistant - Content Script
// Injects paste support into VMware vCenter/ESXi WebMKS consoles

(function () {
  'use strict';

  const SNIPPETS_KEY = 'vcpa_snippets_v1';
  const AUTO_ENTER_KEY = 'vcpa_auto_enter';
  const KEYSTROKE_DELAY_KEY = 'vcpa_keystroke_delay_ms';
  const FIRST_CHAR_DELAY_KEY = 'vcpa_first_char_delay_ms';
  const ENTER_DELAY_KEY = 'vcpa_enter_delay_ms';
  const SHORTCUT_PASTE_ENABLED_KEY = 'vcpa_shortcut_paste_enabled';
  const PANEL_OPEN_KEY = 'vcpa_panel_open_by_default';
  const PANEL_POSITION_KEY = 'vcpa_panel_position';
  const COMPAT_MODE_KEY = 'vcpa_compat_mode';
  const MAX_SNIPPETS = 200;

  // Translate runtime-created console UI text; fall back safely if i18n is still initializing.
  function tr(text) {
    const i18n = globalThis.VCenterPasteI18n;
    return i18n && typeof i18n.t === 'function' ? i18n.t(text) : text;
  }
  const DEFAULT_KEYSTROKE_DELAY_MS = 20;
  const DEFAULT_FIRST_CHAR_DELAY_MS = 40;
  const DEFAULT_ENTER_DELAY_MS = 0;
  const COMPAT_MIN_CHARS = 500;
  const COMPAT_KEYSTROKE_MS = 40;
  const COMPAT_FIRST_CHAR_MS = 80;
  const COMPAT_CHUNK_CHARS = 400;
  const COMPAT_CHUNK_PAUSE_MS = 150;

  const THEME = {
    bg: '#0b1020',
    bgPanel: '#111827',
    border: '#26334d',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    accent: '#3b82f6',
  };

  // vCenter/ESXi consoles are commonly opened as /ui/webconsole.html or in a
  // console route/frame. Hostnames are intentionally not hard-coded because most
  // installations use private DNS names or IP addresses.
  function getFrameContextText() {
    const parts = [
      window.location.href || '',
      window.location.pathname || '',
      window.location.search || '',
      window.location.hash || '',
      document.referrer || '',
      document.title || ''
    ];
    // ESXi Host Client may create WebMKS in an about:blank/blob child frame.
    // Chromium exposes the parent origin chain without requiring DOM access.
    try {
      if (window.location.ancestorOrigins) {
        parts.push(...Array.from(window.location.ancestorOrigins));
      }
    } catch (_error) {}
    return parts.join(' ').toLowerCase();
  }

  // Decide whether this frame is allowed to watch for a console appearing.
  // ESXi creates WebMKS inside a late-populated about:blank/blob frame. At
  // document_idle that frame often has no canvas or console marker yet, while
  // its referrer only contains `/ui/` (the SPA hash route is not forwarded).
  // Treat that Host Client shell/frame as a potential VMware context so the
  // lifecycle observer remains alive until WebMKS mounts.
  function isPotentialVmwareContext() {
    const context = getFrameContextText();
    return context.includes('/ui/') || context.includes('/ui#') ||
      context.includes('vmware') || context.includes('vsphere') ||
      context.includes('webmks') || context.includes('webconsole') ||
      context.includes('remote console') ||
      context.includes('/console') || context.includes('console.html');
  }

  function isVsphereConsole() {
    const context = getFrameContextText();
    const hasWebMksMarker = Boolean(document.querySelector(
      '.webmks, #webmks, [class*="webmks" i], [id*="webmks" i], ' +
      '.vmConsole, .vm-console, .console-screen, .console-container, ' +
      'canvas#mainCanvas, [data-test*="console" i], [class*="remote-console" i], ' +
      '[id*="remote-console" i], [class*="vm-console" i], [id*="vm-console" i]'
    ));
    const hasConsoleRoute =
      context.includes('webconsole') || context.includes('webmks') ||
      context.includes('/console') || context.includes('console.html') ||
      context.includes('remote console');
    const hasVmwareHostContext =
      context.includes('vmware esxi') || context.includes('vsphere client') ||
      context.includes('/ui/#/host/vms/') || context.includes('/ui/#/vms/');
    return hasWebMksMarker || hasConsoleRoute || hasVmwareHostContext;
  }

  // Select only a visible WebMKS console canvas. ESXi/vCenter may keep old
  // canvases hidden in the SPA after a console is closed, so candidates are
  // ranked by focus, explicit WebMKS markers and visible area.
  function isElementVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width >= 160 && rect.height >= 100 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function hasExplicitConsoleMarker(canvas) {
    if (!canvas) return false;
    if (canvas.id === 'mainCanvas' || /(?:webmks|console)/i.test(canvas.id || '') ||
        /(?:webmks|console)/i.test(canvas.className || '')) return true;
    return Boolean(canvas.closest(
      '.webmks, #webmks, [class*="webmks" i], [id*="webmks" i], ' +
      '.vmConsole, .vm-console, .console-screen, .console-container, ' +
      '[class*="remote-console" i], [id*="remote-console" i], ' +
      '[class*="vm-console" i], [id*="vm-console" i]'
    ));
  }

  function findConsoleCanvas() {
    const candidates = Array.from(document.querySelectorAll('canvas')).filter(function (canvas) {
      return isElementVisible(canvas) && (hasExplicitConsoleMarker(canvas) || isVsphereConsole());
    });
    candidates.sort(function (a, b) {
      const active = document.activeElement;
      function score(canvas) {
        const rect = canvas.getBoundingClientRect();
        let value = rect.width * rect.height;
        if (canvas === active) value += 1e10;
        if (hasExplicitConsoleMarker(canvas)) value += 1e9;
        const container = canvas.closest('.vmConsole.ui-draggable, .vmConsole, .vm-console');
        if (container) value += 1e8;
        return value;
      }
      return score(b) - score(a);
    });
    return candidates[0] || null;
  }

  // Resolve the visual console window that owns the WebMKS canvas. ESXi 8 uses
  // .vmConsole.ui-draggable; older Host Client releases use less consistent
  // console wrappers, so progressively fall back to the canvas parent.
  function findConsoleContainer(canvas) {
    if (!canvas) return null;
    const selectors = [
      '.vmConsole.ui-draggable',
      '.vmConsole',
      '.vm-console',
      '.console-screen',
      '.console-container',
      '[class*="remote-console" i]',
      '[id*="remote-console" i]',
      '[class*="webmks" i]',
      '[id*="webmks" i]'
    ];
    for (const selector of selectors) {
      const container = canvas.closest(selector);
      if (container) return container;
    }
    let candidate = canvas.parentElement;
    while (candidate && candidate !== document.body) {
      const rect = candidate.getBoundingClientRect();
      if (rect.width >= canvas.getBoundingClientRect().width &&
          rect.height >= canvas.getBoundingClientRect().height &&
          rect.width >= 240 && rect.height >= 160) {
        return candidate;
      }
      candidate = candidate.parentElement;
    }
    return canvas.parentElement || document.body;
  }



  // Map character to DOM KeyboardEvent code so the WebMKS keyboard handler accepts it
  function getKeyCode(char) {
    const c = char.charCodeAt(0);
    if (char === ' ') return 'Space';
    if (char >= '0' && char <= '9') return 'Digit' + char;
    if (char >= 'A' && char <= 'Z') return 'Key' + char;
    if (char >= 'a' && char <= 'z') return 'Key' + char.toUpperCase();
    const codeMap = {
      '\n': 'Enter', '\r': 'Enter',
      '`': 'Backquote', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft',
      ']': 'BracketRight', '\\': 'Backslash', ';': 'Semicolon', "'": 'Quote',
      ',': 'Comma', '.': 'Period', '/': 'Slash',
      '~': 'Backquote', '!': 'Digit1', '@': 'Digit2', '#': 'Digit3',
      '$': 'Digit4', '%': 'Digit5', '^': 'Digit6', '&': 'Digit7',
      '*': 'Digit8', '(': 'Digit9', ')': 'Digit0', '_': 'Minus',
      '+': 'Equal', '{': 'BracketLeft', '}': 'BracketRight', '|': 'Backslash',
      ':': 'Semicolon', '"': 'Quote', '<': 'Comma', '>': 'Period', '?': 'Slash'
    };
    return codeMap[char] || (c >= 32 && c <= 126 ? 'Key' + char.toUpperCase() : 'KeyA');
  }

  function needsShift(char) {
    if (char >= 'A' && char <= 'Z') return true;
    return "~!@#$%^&*()_+{}|:\"<>?".includes(char);
  }

  // Send a single character to the WebMKS canvas using keyboard events
  function sendChar(canvas, char) {
    const keyCode = char.charCodeAt(0);
    const code = getKeyCode(char);
    const shift = needsShift(char);

    const baseOpts = { bubbles: true, cancelable: true };

    if (shift) {
      canvas.dispatchEvent(new KeyboardEvent('keydown', {
        ...baseOpts, key: 'Shift', code: 'ShiftLeft', keyCode: 16, which: 16, shiftKey: true
      }));
    }

    const keyEventOpts = {
      ...baseOpts, key: char, code, keyCode, which: keyCode, charCode: keyCode, shiftKey: shift
    };

    canvas.dispatchEvent(new KeyboardEvent('keydown', keyEventOpts));
    canvas.dispatchEvent(new KeyboardEvent('keypress', keyEventOpts));
    canvas.dispatchEvent(new KeyboardEvent('keyup', keyEventOpts));

    if (shift) {
      canvas.dispatchEvent(new KeyboardEvent('keyup', {
        ...baseOpts, key: 'Shift', code: 'ShiftLeft', keyCode: 16, which: 16, shiftKey: false
      }));
    }
  }

  // Release modifier and 'v' on the canvas so the VM is not left with Ctrl/Cmd+V "held"
  // (otherwise the first pasted character can be dropped or interpreted as a shortcut).
  function releasePasteKeys(canvas) {
    const opts = { bubbles: true, cancelable: true };
    canvas.dispatchEvent(new KeyboardEvent('keyup', { ...opts, key: 'v', code: 'KeyV', keyCode: 86, which: 86 }));
    canvas.dispatchEvent(new KeyboardEvent('keyup', { ...opts, key: 'Control', code: 'ControlLeft', keyCode: 17, which: 17, ctrlKey: false }));
    canvas.dispatchEvent(new KeyboardEvent('keyup', { ...opts, key: 'Meta', code: 'MetaLeft', keyCode: 91, which: 91, metaKey: false }));
  }

  // Send text character by character. Release paste keys and delay first char so WebMKS is ready.
  function getFirstCharDelayMs() {
    return storageGet(FIRST_CHAR_DELAY_KEY).then(function (val) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) return DEFAULT_FIRST_CHAR_DELAY_MS;
      return Math.min(n, 1000);
    });
  }

  function getKeystrokeDelayMs() {
    return storageGet(KEYSTROKE_DELAY_KEY).then(function (val) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) return DEFAULT_KEYSTROKE_DELAY_MS;
      return Math.min(n, 500);
    });
  }

  function getEnterDelayMs() {
    return storageGet(ENTER_DELAY_KEY).then(function (val) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) return DEFAULT_ENTER_DELAY_MS;
      return Math.min(n, 300);
    });
  }

  function getCompatMode() {
    return storageGet(COMPAT_MODE_KEY).then(function (val) { return Boolean(val); });
  }

  function sendEnter(canvas) {
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new KeyboardEvent('keyup',  { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }

  // Estimate total paste duration (ms) using same timing as sendText.
  // Uses same clamping as sendText (compat uses COMPAT_* minimums) and a small buffer for timer jitter.
  function estimatePasteDurationMs(text, delayMs, firstDelayMs, afterEnterMs, compatLongPaste) {
    const normalized = (text || '').replace(/\r\n/g, '\n');
    let n = normalized.length;
    if (n === 0) return 0;
    let dMs = delayMs;
    let fMs = firstDelayMs;
    if (compatLongPaste) {
      dMs = Math.max(dMs, COMPAT_KEYSTROKE_MS);
      fMs = Math.max(fMs, COMPAT_FIRST_CHAR_MS);
    }
    let newlines = 0;
    for (let j = 0; j < n; j++) if (normalized[j] === '\n' || normalized[j] === '\r') newlines++;
    let total = fMs + (n - 1) * dMs + newlines * afterEnterMs;
    if (compatLongPaste && n > 1) {
      const chunkPauses = Math.floor((n - 1) / COMPAT_CHUNK_CHARS);
      total += chunkPauses * COMPAT_CHUNK_PAUSE_MS;
    }
    return Math.ceil(total * 1.2 + 300);
  }

  let activePasteTask = null;
  let shortcutPasteEnabled = true;

  function sendText(canvas, text, delay, firstCharDelayMs, enterDelayMs, compatLongPaste, options) {
    const cancelledRef = options && options.cancelledRef;
    const onComplete = options && options.onComplete;
    let delayMs = delay != null && Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : DEFAULT_KEYSTROKE_DELAY_MS;
    let firstDelay = firstCharDelayMs != null && Number.isFinite(Number(firstCharDelayMs)) ? Math.max(0, Math.min(1000, Number(firstCharDelayMs))) : DEFAULT_FIRST_CHAR_DELAY_MS;
    const afterEnterMs = enterDelayMs != null && Number.isFinite(Number(enterDelayMs)) ? Math.max(0, Math.min(300, Number(enterDelayMs))) : DEFAULT_ENTER_DELAY_MS;
    if (compatLongPaste) {
      delayMs = Math.max(delayMs, COMPAT_KEYSTROKE_MS);
      firstDelay = Math.max(firstDelay, COMPAT_FIRST_CHAR_MS);
    }
    releasePasteKeys(canvas);
    canvas.focus();
    const normalized = text.replace(/\r\n/g, '\n');
    let i = 0;

    function sendNext() {
      if ((cancelledRef && cancelledRef.cancelled) || !canvas.isConnected) {
        if (cancelledRef) cancelledRef.cancelled = true;
        if (onComplete) onComplete(true, canvas.isConnected ? 'cancelled' : 'disconnected');
        return;
      }
      if (i >= normalized.length) {
        // Complete the task only after the optional trailing Enter has been
        // handled. A replaced/disconnected task must never emit a late Enter.
        storageGet(AUTO_ENTER_KEY).then(function (autoEnter) {
          function finishPaste() {
            if ((cancelledRef && cancelledRef.cancelled) || !canvas.isConnected) {
              if (cancelledRef) cancelledRef.cancelled = true;
              if (onComplete) onComplete(true, canvas.isConnected ? 'cancelled' : 'disconnected');
              return;
            }
            showToast('✓ ' + tr('Pasted {count} characters').replace('{count}', normalized.length), canvas);
            if (onComplete) onComplete(false, 'completed');
          }
          if (autoEnter) {
            setTimeout(function () {
              if ((cancelledRef && cancelledRef.cancelled) || !canvas.isConnected) {
                finishPaste();
                return;
              }
              sendEnter(canvas);
              finishPaste();
            }, delayMs);
          } else {
            finishPaste();
          }
        });
        return;
      }
      const char = normalized[i];
      if (char === '\n' || char === '\r') {
        sendEnter(canvas);
        i++;
        setTimeout(sendNext, delayMs + afterEnterMs);
      } else {
        sendChar(canvas, char);
        i++;
        let nextDelay = delayMs;
        if (compatLongPaste && i > 0 && i % COMPAT_CHUNK_CHARS === 0) {
          nextDelay += COMPAT_CHUNK_PAUSE_MS;
        }
        setTimeout(sendNext, nextDelay);
      }
    }
    setTimeout(sendNext, firstDelay);
  }

  function getOverlayHost(canvas) {
    const wrap = document.getElementById('vcpa-wrap');
    if (wrap && wrap.isConnected) return wrap;
    const container = findConsoleContainer(canvas);
    if (container && container !== document.body) {
      if (window.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
        container.dataset.vcpaPositionAdjusted = 'true';
      }
      return container;
    }
    return document.body;
  }

  function positionOverlayNearPanel(element, host) {
    const attachedToPanel = host && host.id === 'vcpa-wrap';
    const attachedToConsole = host && host !== document.body;
    Object.assign(element.style, attachedToPanel ? {
      // The notification is a child of the floating window, therefore it moves
      // with the window and remains anchored when ESXi moves its console dialog.
      position: 'absolute', bottom: 'calc(100% + 8px)', right: '0', top: 'auto', left: 'auto'
    } : attachedToConsole ? {
      // During the short interval before the floating window is mounted, keep
      // feedback inside the ESXi console instead of the browser viewport.
      position: 'absolute', bottom: '16px', right: '16px', top: 'auto', left: 'auto'
    } : {
      position: 'fixed', bottom: '16px', right: '16px', top: 'auto', left: 'auto'
    });
  }

  function cancelActivePaste(reason) {
    if (!activePasteTask) return;
    activePasteTask.reason = reason || 'cancelled';
    activePasteTask.cancelled = true;
  }

  function sendTextWithStoredDelay(canvas, text) {
    // A console receives only one character stream at a time. Starting a new
    // paste cancels the old task so two streams can never interleave.
    cancelActivePaste('replaced');
    const task = { cancelled: false, reason: '', canvas: canvas };
    activePasteTask = task;

    return Promise.all([getKeystrokeDelayMs(), getFirstCharDelayMs(), getEnterDelayMs(), getCompatMode()]).then(function (vals) {
      if (task.cancelled || !canvas.isConnected) {
        if (activePasteTask === task) activePasteTask = null;
        return { status: 'cancelled' };
      }
      const delayMs = vals[0];
      const firstDelayMs = vals[1];
      const afterEnterMs = vals[2];
      const compatLongPaste = Boolean(vals[3]) && text.length > COMPAT_MIN_CHARS;
      const estimatedMs = estimatePasteDurationMs(text, delayMs, firstDelayMs, afterEnterMs, compatLongPaste);
      const showTimer = estimatedMs >= 5000;
      const host = getOverlayHost(canvas);
      let timerEl = null;
      let timerInterval = null;

      return new Promise(function (resolve) {
        function hidePasteTimer() {
          if (timerInterval) clearInterval(timerInterval);
          timerInterval = null;
          if (timerEl && timerEl.parentNode) timerEl.parentNode.removeChild(timerEl);
          timerEl = null;
        }

        let completedCalled = false;
        function onComplete(cancelled, result) {
          if (completedCalled) return;
          completedCalled = true;
          hidePasteTimer();
          if (activePasteTask === task) activePasteTask = null;
          const status = cancelled ? (task.reason || result || 'cancelled') : 'completed';
          if (cancelled && status !== 'replaced') {
            showToast(status === 'disconnected' ? tr('Console closed — paste cancelled') : tr('Paste cancelled'), canvas);
          }
          resolve({ status: status });
        }

        if (showTimer) {
          const startMs = Date.now();
          timerEl = document.createElement('div');
          timerEl.id = 'vcpa-paste-timer';
          Object.assign(timerEl.style, {
            background: THEME.bgPanel, color: THEME.text,
            border: '1px solid ' + THEME.accent, borderRadius: '6px',
            padding: '8px 12px', fontSize: '12px',
            fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
            zIndex: '9999999', display: 'flex', flexDirection: 'column', gap: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)', pointerEvents: 'auto', minWidth: '160px'
          });
          positionOverlayNearPanel(timerEl, host);
          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.gap = '10px';
          const label = document.createElement('span');
          label.textContent = tr('Pasting… ');
          const timeSpan = document.createElement('span');
          timeSpan.style.fontWeight = '600';
          const xBtn = document.createElement('button');
          xBtn.type = 'button';
          xBtn.textContent = '\u2715';
          xBtn.title = tr('Stop paste');
          xBtn.setAttribute('aria-label', tr('Stop paste'));
          Object.assign(xBtn.style, {
            background: 'transparent', border: 'none', color: THEME.textMuted,
            cursor: 'pointer', fontSize: '14px', padding: '6px 8px', lineHeight: 1,
            marginLeft: 'auto', minWidth: '28px', minHeight: '28px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto'
          });
          xBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            task.reason = 'cancelled';
            task.cancelled = true;
          });
          row.appendChild(label);
          row.appendChild(timeSpan);
          row.appendChild(xBtn);
          timerEl.appendChild(row);
          const progressTrack = document.createElement('div');
          progressTrack.style.cssText = 'height:4px;background:' + THEME.border + ';border-radius:2px;overflow:hidden;width:100%;';
          const progressFill = document.createElement('div');
          progressFill.style.cssText = 'height:100%;background:' + THEME.accent + ';border-radius:2px;width:0%;transition:width 0.2s ease;';
          progressTrack.appendChild(progressFill);
          timerEl.appendChild(progressTrack);
          host.appendChild(timerEl);
          function formatRemaining(ms) {
            const seconds = Math.max(0, Math.ceil(ms / 1000));
            return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
          }
          function updateTimer() {
            if (task.cancelled) return;
            const elapsed = Date.now() - startMs;
            timeSpan.textContent = formatRemaining(Math.max(0, estimatedMs - elapsed));
            progressFill.style.width = (estimatedMs > 0 ? Math.min(100, elapsed / estimatedMs * 100) : 100) + '%';
          }
          updateTimer();
          timerInterval = setInterval(updateTimer, 500);
        }

        sendText(canvas, text, delayMs, firstDelayMs, afterEnterMs, compatLongPaste, {
          cancelledRef: task,
          onComplete: onComplete
        });
      });
    });
  }

  // Read clipboard and paste into canvas
  async function pasteClipboard(canvas) {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { showToast('⚠ ' + tr('Clipboard is empty'), canvas); return; }
      showToast('⏳ ' + tr('Pasting {count} characters…').replace('{count}', text.length), canvas);
      sendTextWithStoredDelay(canvas, text);
    } catch (_) {
      showToast('⚠ ' + tr('Clipboard blocked — open panel and paste into the text box'), canvas);
    }
  }

  // Toast notifications are mounted beside the floating panel, not at the
  // browser viewport corner, so feedback follows the active ESXi console.
  let toastTimeout;
  function showToast(message, canvas) {
    const targetCanvas = canvas && canvas.isConnected ? canvas : findConsoleCanvas();
    const host = getOverlayHost(targetCanvas);
    let toast = document.getElementById('vcpa-paste-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'vcpa-paste-toast';
      Object.assign(toast.style, {
        background: THEME.bgPanel, color: THEME.text,
        border: '1px solid ' + THEME.border, borderRadius: '6px',
        padding: '7px 11px', fontSize: '11px', whiteSpace: 'nowrap',
        fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
        zIndex: '9999999', pointerEvents: 'none', opacity: '0',
        transition: 'opacity 0.2s ease', boxShadow: '0 4px 12px rgba(0,0,0,0.6)'
      });
    }
    if (toast.parentNode !== host) host.appendChild(toast);
    positionOverlayNearPanel(toast, host);
    toast.textContent = message;
    requestAnimationFrame(function () { toast.style.opacity = '1'; });
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () { toast.style.opacity = '0'; }, 2400);
  }

  // Storage helpers
  function storageGet(key) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return chrome.storage.local.get([key]).then((res) => res[key]);
      }
    } catch (_) {}
    try {
      const raw = localStorage.getItem(key);
      return Promise.resolve(raw ? JSON.parse(raw) : undefined);
    } catch (_) { return Promise.resolve(undefined); }
  }

  function storageSet(key, value) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return chrome.storage.local.set({ [key]: value });
      }
    } catch (_) {}
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    return Promise.resolve();
  }

  async function getSnippets() {
    const v = await storageGet(SNIPPETS_KEY);
    return Array.isArray(v) ? v : [];
  }

  async function saveSnippet({ id, name, text }) {
    const now = Date.now();
    const snippets = await getSnippets();
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return { ok: false, reason: 'no_name' };
    const trimmedText = String(text || '');
    if (!trimmedText) return { ok: false, reason: 'no_text' };

    if (id) {
      const idx = snippets.findIndex((s) => s.id === id);
      if (idx >= 0) {
        snippets[idx] = { ...snippets[idx], name: trimmedName, text: trimmedText, updatedAt: now };
      } else {
        snippets.unshift({ id, name: trimmedName, text: trimmedText, updatedAt: now });
      }
    } else {
      const newId = 's_' + now + '_' + Math.random().toString(16).slice(2);
      snippets.unshift({ id: newId, name: trimmedName, text: trimmedText, updatedAt: now });
      id = newId;
    }
    await storageSet(SNIPPETS_KEY, snippets.slice(0, MAX_SNIPPETS));
    return { ok: true, id };
  }

  async function deleteSnippet(id) {
    const snippets = await getSnippets();
    await storageSet(SNIPPETS_KEY, snippets.filter((s) => s.id !== id));
  }

  async function reorderSnippets(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const snippets = await getSnippets();
    if (fromIndex < 0 || fromIndex >= snippets.length || toIndex < 0 || toIndex >= snippets.length) return;
    const [item] = snippets.splice(fromIndex, 1);
    snippets.splice(toIndex, 0, item);
    await storageSet(SNIPPETS_KEY, snippets);
  }

  // ─────────────────────────────────────────────────────────────────
  // Inject floating paste button + expandable panel
  // ─────────────────────────────────────────────────────────────────
  function injectButton(canvas) {
    const tr = function (text) {
      return window.VCenterPasteI18n ? window.VCenterPasteI18n.t(text) : text;
    };

    // ── SVG icons ──
    const CLIP_LG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1.5"/></svg>`;
    const CLIP_SM = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1.5"/></svg>`;
    const LIST_SM = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
    const CHEV_DOWN = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    const GRIP = `<svg width="10" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`;
    const CHEV_UP   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
    const CHEV_R    = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
    const PENCIL    = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    const GEAR      = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

    // ── CSS (all colors from THEME at top of file) ──
    const CSS = `
      #vcpa-wrap {
        position: absolute; bottom: 16px; right: 16px; z-index: 999999;
        font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
        display: flex; flex-direction: column; align-items: flex-end;
        -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
      }
      #vcpa-wrap * { box-sizing: border-box; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

      /* Gap between pill and panel */
      #vcpa-panel.open { margin-bottom: 8px; }

      /* ── Collapsed pill ── */
      #vcpa-btns {
        display: flex; align-items: center;
        background: ${THEME.bgPanel}; border: 1px solid ${THEME.border}; border-radius: 16px;
        overflow: hidden; cursor: pointer;
        box-shadow: 0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
        transition: border-color 0.15s;
      }
      #vcpa-btns:hover { border-color: ${THEME.accent}; }
      #vcpa-btns:hover .vcpa-pill-icon { background: ${THEME.accent}; }
      .vcpa-pill-icon {
        width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
        background: ${THEME.border}; transition: background 0.15s; cursor: pointer;
      }
      .vcpa-pill-icon svg { color: ${THEME.accent}; transition: color 0.15s; }
      #vcpa-btns:hover .vcpa-pill-icon svg { color: ${THEME.text}; }
      .vcpa-pill-chev {
        width: 28px; height: 36px; display: flex; align-items: center; justify-content: center;
        border-left: 1px solid ${THEME.border}; cursor: pointer;
      }
      .vcpa-pill-chev svg { color: ${THEME.textMuted}; transition: color 0.15s; }
      #vcpa-btns:hover .vcpa-pill-chev svg { color: ${THEME.accent}; }

      /* ── Panel (fixed size so it does not resize when switching tabs) ── */
      #vcpa-panel {
        display: none; flex-direction: column; width: 380px; height: 400px; min-height: 400px;
        background: ${THEME.bgPanel}; border: 1px solid ${THEME.border}; border-radius: 6px;
        overflow: visible; position: relative;
        box-shadow: 0 20px 48px rgba(0,0,0,0.7);
      }
      #vcpa-panel.open { display: flex; }

      /* ── Title bar (like popup: title + settings + collapse) ── */
      .vcpa-title-bar {
        flex-shrink: 0; display: flex; align-items: stretch;
        padding: 0 0 0 14px; border-bottom: 1px solid ${THEME.border};
        background: ${THEME.bg}; border-radius: 6px 6px 0 0;
      }
      .vcpa-title {
        flex: 1; display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 600; letter-spacing: 0.14em;
        text-transform: uppercase; color: ${THEME.textMuted};
        min-height: 36px;
      }
      .vcpa-title-bar-actions {
        display: flex; align-items: stretch; flex-shrink: 0;
      }
      .vcpa-hdr-close {
        display: flex; align-items: center; justify-content: center;
        min-height: 36px; padding: 8px 0; width: 44px; flex-shrink: 0;
        border-left: 1px solid ${THEME.border}; color: ${THEME.textMuted}; cursor: pointer;
        transition: color 0.15s, background 0.15s;
      }
      .vcpa-hdr-close:hover { background: ${THEME.bgPanel}; color: ${THEME.textMuted}; }
      /* ── Tab header ── */
      #vcpa-header {
        display: flex; align-items: stretch; background: ${THEME.bg};
        border-bottom: 1px solid ${THEME.border}; overflow: hidden;
      }
      .vcpa-tabs { display: flex; align-items: stretch; flex: 1; }
      .vcpa-tab {
        flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
        padding: 13px 10px 11px; background: transparent; border: none;
        border-bottom: 2px solid transparent; margin-bottom: -1px;
        font-family: inherit; font-size: 11px; font-weight: 500;
        letter-spacing: 0.12em; text-transform: uppercase; color: ${THEME.textMuted};
        cursor: pointer; transition: color 0.15s, border-color 0.15s;
        -webkit-appearance: none; appearance: none;
      }
      .vcpa-tab + .vcpa-tab { border-left: 1px solid ${THEME.border}; }
      .vcpa-tab:hover { color: ${THEME.textMuted}; }
      .vcpa-tab.active { color: ${THEME.text}; border-bottom-color: ${THEME.accent}; }
      .vcpa-tab svg { color: inherit; }

      /* ── Views (fill panel so Paste and Snippets use same height) ── */
      .vcpa-view { display: none; flex-direction: column; flex: 1; min-width: 0; min-height: 0; width: 100%; box-sizing: border-box; }
      .vcpa-view.active { display: flex; }

      /* ── Paste view ── */
      #vcpa-textarea {
        flex: 1; min-height: 0; width: 100%; background: transparent; border: none; outline: none;
        resize: none; font-family: inherit; font-size: 12px; color: ${THEME.textMuted};
        padding: 11px 12px; display: block; caret-color: ${THEME.accent};
      }
      #vcpa-textarea::placeholder { color: ${THEME.textMuted}; }

      /* ── Paste & Snippets footers (same style) ── */
      #vcpa-footer,
      .vcpa-snip-footer {
        flex-shrink: 0;
        padding: 9px 12px; border-top: 1px solid ${THEME.border};
        background: ${THEME.bg}; border-radius: 0 0 6px 6px;
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        flex-wrap: nowrap;
      }
      .vcpa-snip-footer-inner { min-width: 0; overflow: hidden; }
      .vcpa-kbd {
        font-size: 9px; font-weight: 500; color: ${THEME.textMuted}; background: ${THEME.bg};
        border: 1px solid ${THEME.border}; border-radius: 4px; padding: 2px 5px;
        letter-spacing: 0.05em; white-space: nowrap; flex-shrink: 0;
      }
      .vcpa-footer-btns { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

      #vcpa-save-snip-btn {
        background: transparent; border: 1px solid ${THEME.border}; border-radius: 4px;
        color: ${THEME.textMuted}; font-family: inherit; font-size: 9px; font-weight: 500;
        letter-spacing: 0.08em; padding: 5px 10px; cursor: pointer; white-space: nowrap;
        transition: border-color 0.12s, color 0.12s;
        -webkit-appearance: none; appearance: none;
      }
      #vcpa-save-snip-btn:hover,
      #vcpa-save-snip-btn.active { border-color: ${THEME.accent}; color: ${THEME.accent}; }

      #vcpa-send {
        background: ${THEME.accent}; color: ${THEME.text}; border: none; border-radius: 4px;
        font-family: inherit; font-size: 9px; font-weight: 500; letter-spacing: 0.08em;
        padding: 5px 12px; cursor: pointer; white-space: nowrap;
        display: flex; align-items: center; gap: 5px;
        transition: background 0.12s; -webkit-appearance: none; appearance: none;
      }
      #vcpa-send:hover { background: ${THEME.accent}; }

      #vcpa-clear {
        background: transparent; border: 1px solid ${THEME.border}; border-radius: 4px;
        color: ${THEME.textMuted}; font-family: inherit; font-size: 9px; font-weight: 500;
        letter-spacing: 0.06em; padding: 5px 10px; cursor: pointer; white-space: nowrap;
        transition: border-color 0.12s, color 0.12s;
        -webkit-appearance: none; appearance: none;
      }
      #vcpa-clear:hover { border-color: ${THEME.accent}; color: ${THEME.accent}; }

      /* Save bar (slides in below footer) */
      #vcpa-save-bar {
        display: none; align-items: center; gap: 6px; padding: 0 10px 10px;
      }
      #vcpa-save-bar.open { display: flex; }
      #vcpa-save-bar-input {
        flex: 1; min-width: 0; background: ${THEME.bg}; border: 1px solid ${THEME.border};
        border-radius: 4px; font-family: inherit; font-size: 10px; color: ${THEME.textMuted};
        padding: 5px 8px; outline: none; transition: border-color 0.12s;
      }
      #vcpa-save-bar-input:focus { border-color: ${THEME.accent}; }
      #vcpa-save-bar-input::placeholder { color: ${THEME.textMuted}; }
      #vcpa-save-bar-confirm {
        background: ${THEME.accent}; border: none; border-radius: 4px; color: ${THEME.text};
        font-family: inherit; font-size: 9px; font-weight: 500; padding: 5px 10px;
        cursor: pointer; white-space: nowrap; transition: background 0.12s;
        -webkit-appearance: none; appearance: none;
      }
      #vcpa-save-bar-confirm:hover { background: ${THEME.accent}; }
      #vcpa-save-bar-cancel {
        background: transparent; border: 1px solid ${THEME.border}; border-radius: 4px;
        color: ${THEME.textMuted}; font-family: inherit; font-size: 9px; padding: 5px 8px;
        cursor: pointer; transition: border-color 0.12s, color 0.12s;
        -webkit-appearance: none; appearance: none;
      }
      #vcpa-save-bar-cancel:hover { border-color: ${THEME.textMuted}; color: ${THEME.textMuted}; }

      /* ── Snippets view ── */
      .vcpa-snip-scroll {
        flex: 1; min-height: 0; overflow-y: auto; padding: 8px;
        display: flex; flex-direction: column; gap: 4px;
      }
      .vcpa-snip-scroll::-webkit-scrollbar { width: 4px; }
      .vcpa-snip-scroll::-webkit-scrollbar-track { background: transparent; }
      .vcpa-snip-scroll::-webkit-scrollbar-thumb { background: ${THEME.border}; border-radius: 2px; }

      .vcpa-snip-row {
        display: flex; align-items: center; gap: 8px; padding: 8px 10px;
        border-radius: 4px; border: 1px solid ${THEME.border}; background: ${THEME.bg};
        position: relative; transition: border-color 0.12s, background 0.12s;
      }
      .vcpa-snip-row:hover { border-color: ${THEME.border}; background: ${THEME.bgPanel}; }
      .vcpa-snip-row.editing { border-color: ${THEME.accent}; background: ${THEME.bgPanel}; }
      .vcpa-snip-row.dragging { opacity: 0.5; }
      .vcpa-snip-row.drag-over { border-color: ${THEME.accent}; background: ${THEME.bgPanel}; }
      .vcpa-snip-row .vcpa-snip-drag-handle { cursor: grab; color: ${THEME.textMuted}; flex-shrink: 0; }
      .vcpa-snip-row .vcpa-snip-drag-handle:active { cursor: grabbing; }

      .vcpa-snip-info { flex: 1; min-width: 0; }
      .vcpa-snip-name {
        font-size: 10px; color: ${THEME.accent}; letter-spacing: 0.08em;
        text-transform: uppercase; margin-bottom: 3px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .vcpa-snip-preview {
        font-size: 10px; color: ${THEME.textMuted}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      .vcpa-snip-actions {
        flex-shrink: 0; width: max-content; min-width: 0;
        display: flex; align-items: center; gap: 4px;
      }
      .vcpa-snip-actions-extra {
        display: flex; align-items: center; gap: 4px;
        opacity: 0; transition: opacity 0.12s;
      }
      .vcpa-snip-row:hover .vcpa-snip-actions-extra,
      .vcpa-snip-row.editing .vcpa-snip-actions-extra { opacity: 1; }

      /* Scoped so host page button styles don't override; same height for all */
      #vcpa-wrap .vcpa-snip-send,
      #vcpa-wrap .vcpa-snip-edit,
      #vcpa-wrap .vcpa-snip-del {
        height: 24px; min-height: 24px; box-sizing: border-box;
        display: inline-flex; align-items: center; justify-content: center;
        flex: 0 0 auto !important; width: max-content !important; max-width: max-content !important;
        min-width: 0;
        -webkit-appearance: none; appearance: none;
      }
      #vcpa-wrap .vcpa-snip-send {
        background: ${THEME.accent}; border: none; border-radius: 4px; color: ${THEME.text};
        font-family: inherit; font-size: 9px; padding: 0 9px;
        cursor: pointer; white-space: nowrap; transition: background 0.12s;
      }
      #vcpa-wrap .vcpa-snip-send:hover { background: ${THEME.accent}; }

      #vcpa-wrap .vcpa-snip-edit {
        background: transparent; border: 1px solid ${THEME.border}; border-radius: 3px;
        color: ${THEME.textMuted}; cursor: pointer; padding: 0;
        width: 24px !important; min-width: 24px !important; max-width: 24px !important;
        transition: border-color 0.12s, color 0.12s;
      }
      #vcpa-wrap .vcpa-snip-edit svg { width: 9px; height: 9px; }
      #vcpa-wrap .vcpa-snip-edit:hover,
      #vcpa-wrap .vcpa-snip-edit.active { border-color: ${THEME.accent}; color: ${THEME.accent}; }

      #vcpa-wrap .vcpa-snip-del {
        background: transparent; border: none; color: ${THEME.textMuted};
        cursor: pointer; font-size: 14px; padding: 0; line-height: 1;
        width: 28px !important; min-width: 28px !important; max-width: 28px !important;
        height: 28px !important; min-height: 28px !important;
        transition: color 0.12s;
      }
      #vcpa-wrap .vcpa-snip-del:hover { color: ${THEME.accent}; }

      .vcpa-snip-empty {
        padding: 24px 12px; text-align: center; font-size: 10px; color: ${THEME.textMuted}; line-height: 1.7;
      }

      .vcpa-snip-hint { font-size: 9px; color: ${THEME.textMuted}; letter-spacing: 0.08em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .vcpa-snip-hint span { color: ${THEME.textMuted}; }
      #vcpa-wrap .vcpa-snip-new-btn {
        flex-shrink: 0; background: ${THEME.accent}; border: none; border-radius: 4px; color: ${THEME.text};
        font-family: inherit; font-size: 9px; font-weight: 500; letter-spacing: 0.08em;
        padding: 5px 12px; cursor: pointer; white-space: nowrap;
        display: flex; align-items: center; gap: 5px;
        transition: background 0.12s; -webkit-appearance: none; appearance: none;
      }
      #vcpa-wrap .vcpa-snip-new-btn:hover { background: ${THEME.accent}; }

      /* ── Snippet editor overlay: keep it inside the panel on every screen edge ── */
      #vcpa-edit-pop {
        display: none; position: absolute; left: 12px; right: 12px; top: 82px;
        width: auto; max-height: calc(100% - 94px); background: ${THEME.bgPanel};
        border: 1px solid ${THEME.accent}; border-radius: 6px; overflow: auto; z-index: 20;
        box-shadow: 0 16px 40px rgba(0,0,0,0.82), 0 0 0 1px rgba(59,130,246,0.16);
      }
      #vcpa-edit-pop.open { display: block; animation: vcpaPopIn 0.15s ease; }

      @keyframes vcpaPopIn {
        from { opacity: 0; transform: translateX(6px); }
        to   { opacity: 1; transform: translateX(0); }
      }

      .vcpa-pop-hdr {
        padding: 8px 11px; border-bottom: 1px solid ${THEME.border}; background: ${THEME.bg};
        display: flex; align-items: center; justify-content: space-between;
      }
      .vcpa-pop-title { font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; color: ${THEME.accent}; }
      #vcpa-wrap .vcpa-pop-x {
        background: transparent; border: none; color: ${THEME.textMuted}; cursor: pointer;
        font-size: 13px; line-height: 1; padding: 0 2px; transition: color 0.12s;
        flex: 0 0 auto !important; width: max-content !important; max-width: max-content !important;
        min-width: 0; box-sizing: border-box;
        -webkit-appearance: none; appearance: none;
      }
      #vcpa-wrap .vcpa-pop-x:hover { color: ${THEME.textMuted}; }

      .vcpa-pop-body { padding: 10px; display: flex; flex-direction: column; gap: 7px; }
      .vcpa-field-lbl {
        font-size: 8px; letter-spacing: 0.15em; text-transform: uppercase; color: ${THEME.textMuted}; margin-bottom: 4px;
      }
      .vcpa-field-in {
        width: 100%; background: ${THEME.bg}; border: 1px solid ${THEME.border}; border-radius: 4px;
        font-family: inherit; font-size: 11px; color: ${THEME.textMuted}; padding: 6px 9px;
        outline: none; transition: border-color 0.12s;
      }
      .vcpa-field-in:focus { border-color: ${THEME.accent}; }
      .vcpa-field-ta {
        width: 100%; background: ${THEME.bg}; border: 1px solid ${THEME.border}; border-radius: 4px;
        font-family: inherit; font-size: 11px; color: ${THEME.textMuted}; padding: 7px 9px;
        outline: none; resize: none; height: 72px; line-height: 1.5;
        transition: border-color 0.12s;
      }
      .vcpa-field-ta:focus { border-color: ${THEME.accent}; }

      .vcpa-pop-ftr {
        padding: 8px 10px; border-top: 1px solid ${THEME.border}; background: ${THEME.bg};
        display: flex; justify-content: flex-end; gap: 6px;
      }
      .vcpa-pop-cancel {
        background: transparent; border: 1px solid ${THEME.border}; border-radius: 4px;
        color: ${THEME.textMuted}; font-family: inherit; font-size: 9px; padding: 5px 10px;
        cursor: pointer; transition: border-color 0.12s, color 0.12s;
        -webkit-appearance: none; appearance: none;
      }
      .vcpa-pop-cancel:hover { border-color: ${THEME.textMuted}; color: ${THEME.textMuted}; }
      .vcpa-pop-save {
        background: ${THEME.accent}; border: none; border-radius: 4px; color: ${THEME.text};
        font-family: inherit; font-size: 9px; font-weight: 500; padding: 5px 12px;
        cursor: pointer; transition: background 0.12s;
        -webkit-appearance: none; appearance: none;
      }
      .vcpa-pop-save:hover { background: ${THEME.accent}; }


      /* Modern glass interface */
      #vcpa-wrap { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
      #vcpa-panel {
        width: min(420px, calc(100vw - 24px)); height: 440px; min-height: 440px;
        background: rgba(15,23,42,.96); border: 1px solid rgba(148,163,184,.22);
        border-radius: 18px; overflow: hidden; backdrop-filter: blur(20px) saturate(145%);
        box-shadow: 0 28px 80px rgba(0,0,0,.52), 0 0 0 1px rgba(255,255,255,.035) inset;
      }
      #vcpa-panel.open { margin-bottom: 12px; animation: vcpa-rise .2s cubic-bezier(.2,.8,.2,1); }
      @keyframes vcpa-rise { from { opacity:0; transform:translateY(8px) scale(.98) } to { opacity:1; transform:none } }
      .vcpa-title-bar { min-height: 50px; padding: 0 8px 0 18px; background: linear-gradient(135deg,rgba(30,41,59,.98),rgba(15,23,42,.98)); border-radius:0; }
      .vcpa-title { justify-content:flex-start; color:#f8fafc; font-size:13px; letter-spacing:.02em; text-transform:none; }
      .vcpa-title::before { content:''; width:9px; height:9px; margin-right:10px; border-radius:50%; background:#22c55e; box-shadow:0 0 0 4px rgba(34,197,94,.12); }
      .vcpa-hdr-close { width:40px; min-height:36px; margin:6px 0; border:0; border-radius:10px; }
      .vcpa-hdr-close:hover { background:rgba(148,163,184,.12); color:#fff; }
      #vcpa-header { padding:7px; background:rgba(2,6,23,.46); border-bottom-color:rgba(148,163,184,.14); }
      .vcpa-tabs { gap:7px; }
      .vcpa-tab { padding:9px 12px; border:0!important; border-radius:10px; margin:0; font-size:12px; letter-spacing:0; text-transform:none; }
      .vcpa-tab:hover { color:#e2e8f0; background:rgba(148,163,184,.08); }
      .vcpa-tab.active { color:#fff; background:rgba(59,130,246,.18); box-shadow:0 0 0 1px rgba(96,165,250,.20) inset; }
      #vcpa-textarea { box-sizing:border-box!important; align-self:stretch; margin:12px; width:calc(100% - 24px)!important; min-width:0; max-width:none!important; border:1px solid rgba(148,163,184,.18); border-radius:13px; background:rgba(2,6,23,.42); padding:14px; color:#e2e8f0; font-size:13px; line-height:1.6; }
      #vcpa-textarea:focus { border-color:rgba(96,165,250,.65); box-shadow:0 0 0 3px rgba(59,130,246,.12); }
      #vcpa-footer,.vcpa-snip-footer { padding:11px 12px; background:rgba(2,6,23,.42); border-radius:0; border-top-color:rgba(148,163,184,.14); }
      #vcpa-send,.vcpa-snip-new-btn,.vcpa-snip-send { background:linear-gradient(135deg,#3b82f6,#2563eb); border:0; border-radius:9px; color:#fff; box-shadow:0 6px 16px rgba(37,99,235,.24); }
      #vcpa-send:hover,.vcpa-snip-new-btn:hover,.vcpa-snip-send:hover { filter:brightness(1.1); transform:translateY(-1px); }
      #vcpa-clear,.vcpa-save-snip-btn,.vcpa-edit-cancel { border-radius:9px; border-color:rgba(148,163,184,.22); background:rgba(148,163,184,.06); }
      .vcpa-snip-scroll { padding:10px; gap:7px; }
      .vcpa-snip-row { padding:10px 11px; border-radius:12px; border-color:rgba(148,163,184,.16); background:rgba(30,41,59,.56); }
      .vcpa-snip-row:hover { border-color:rgba(96,165,250,.4); background:rgba(30,41,59,.82); transform:translateY(-1px); }
      .vcpa-snip-name { color:#93c5fd; text-transform:none; letter-spacing:0; font-size:12px; }
      #vcpa-edit-pop { border-color:rgba(96,165,250,.5); border-radius:14px; background:#111827; box-shadow:0 24px 64px rgba(0,0,0,.52); }
      #vcpa-btns { border-radius:14px; background:rgba(15,23,42,.94); border-color:rgba(148,163,184,.24); backdrop-filter:blur(16px); }
      .vcpa-pill-icon { width:40px; height:40px; background:rgba(59,130,246,.16); }
      .vcpa-pill-chev { height:40px; }
      @media (max-width:520px) { #vcpa-wrap { right:8px!important; left:8px!important; align-items:flex-end; } #vcpa-panel { width:calc(100vw - 16px); height:min(440px,calc(100vh - 80px)); min-height:320px; } }
    `;

    // Keep one shared stylesheet across console close/reopen cycles.
    if (!document.getElementById('vcpa-console-style')) {
      const style = document.createElement('style');
      style.id = 'vcpa-console-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const shortcutLabel = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? '\u2318V' : 'Ctrl+V';

    // ── Outer wrapper ──
    const wrap = document.createElement('div');
    wrap.id = 'vcpa-wrap';

    // ── Panel ──
    const panel = document.createElement('div');
    panel.id = 'vcpa-panel';

    // ── Title bar (like popup) ──
    const titleBar = document.createElement('div');
    titleBar.className = 'vcpa-title-bar';
    const titleEl = document.createElement('span');
    titleEl.className = 'vcpa-title';
    titleEl.textContent = tr('vCenter Paste Assistant');

    const hdrClose = document.createElement('span');
    hdrClose.className = 'vcpa-hdr-close';
    hdrClose.title = tr('Collapse');
    hdrClose.innerHTML = CHEV_DOWN;

    const titleBarActions = document.createElement('div');
    titleBarActions.className = 'vcpa-title-bar-actions';
    titleBarActions.appendChild(hdrClose);

    titleBar.appendChild(titleEl);
    titleBar.appendChild(titleBarActions);

    // ── Header / tabs only ──
    const header = document.createElement('div');
    header.id = 'vcpa-header';

    const tabs = document.createElement('div');
    tabs.className = 'vcpa-tabs';

    const pasteTab = document.createElement('button');
    pasteTab.type = 'button';
    pasteTab.className = 'vcpa-tab active';
    pasteTab.innerHTML = CLIP_SM + '<span>' + tr('Paste') + '</span>';

    const snipsTab = document.createElement('button');
    snipsTab.type = 'button';
    snipsTab.className = 'vcpa-tab';
    snipsTab.innerHTML = LIST_SM + '<span>' + tr('Snippets') + '</span>';

    tabs.appendChild(pasteTab);
    tabs.appendChild(snipsTab);
    header.appendChild(tabs);

    // ── Paste view ──
    const pasteView = document.createElement('div');
    pasteView.className = 'vcpa-view active';
    pasteView.id = 'vcpa-paste-view';

    const textarea = document.createElement('textarea');
    textarea.id = 'vcpa-textarea';
    textarea.placeholder = tr('Paste or type text here…');

    const footer = document.createElement('div');
    footer.id = 'vcpa-footer';

    const kbdHint = document.createElement('span');
    kbdHint.className = 'vcpa-kbd';
    kbdHint.textContent = shortcutLabel;

    const footerBtns = document.createElement('div');
    footerBtns.className = 'vcpa-footer-btns';

    const saveSnipBtn = document.createElement('button');
    saveSnipBtn.type = 'button';
    saveSnipBtn.id = 'vcpa-save-snip-btn';
    saveSnipBtn.textContent = tr('Save as Snippet');

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.id = 'vcpa-clear';
    clearBtn.textContent = tr('Clear');

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.id = 'vcpa-send';
    sendBtn.innerHTML = '<span>' + tr('Paste into VM') + '</span>' + CHEV_R;

    footerBtns.appendChild(clearBtn);
    footerBtns.appendChild(saveSnipBtn);
    footerBtns.appendChild(sendBtn);
    footer.appendChild(kbdHint);
    footer.appendChild(footerBtns);

    // Save bar
    const saveBar = document.createElement('div');
    saveBar.id = 'vcpa-save-bar';

    const saveBarInput = document.createElement('input');
    saveBarInput.type = 'text';
    saveBarInput.id = 'vcpa-save-bar-input';
    saveBarInput.placeholder = tr('Name this snippet…');

    const saveBarConfirm = document.createElement('button');
    saveBarConfirm.type = 'button';
    saveBarConfirm.id = 'vcpa-save-bar-confirm';
    saveBarConfirm.textContent = tr('Save');

    const saveBarCancel = document.createElement('button');
    saveBarCancel.type = 'button';
    saveBarCancel.id = 'vcpa-save-bar-cancel';
    saveBarCancel.textContent = tr('Cancel');

    saveBar.appendChild(saveBarInput);
    saveBar.appendChild(saveBarConfirm);
    saveBar.appendChild(saveBarCancel);

    pasteView.appendChild(textarea);
    pasteView.appendChild(footer);
    pasteView.appendChild(saveBar);

    // ── Save bar logic ──
    function openSaveBar() {
      saveBar.classList.add('open');
      saveSnipBtn.classList.add('active');
      saveBarInput.focus();
    }
    function closeSaveBar() {
      saveBar.classList.remove('open');
      saveSnipBtn.classList.remove('active');
      saveBarInput.value = '';
    }

    saveSnipBtn.addEventListener('click', () => {
      saveBar.classList.contains('open') ? closeSaveBar() : openSaveBar();
    });

    saveBarConfirm.addEventListener('click', async () => {
      const text = textarea.value;
      if (!text.trim()) { showToast('⚠ ' + tr('Nothing to save')); return; }
      const firstLine = (text.split(/\r?\n/).find((ln) => ln.trim().length) || '').trim();
      const auto = firstLine.length > 40 ? firstLine.slice(0, 37) + '\u2026' : firstLine;
      const name = (saveBarInput.value.trim()) || auto || 'Snippet';
      const res = await saveSnippet({ name, text });
      if (!res.ok) { showToast('⚠ ' + tr('Could not save')); return; }
      closeSaveBar();
      showToast('✓ ' + tr('Snippet saved'));
    });
    saveBarCancel.addEventListener('click', closeSaveBar);
    saveBarInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveBarConfirm.click(); }
      if (e.key === 'Escape') closeSaveBar();
    });

    clearBtn.addEventListener('click', () => {
      textarea.value = '';
    });

    sendBtn.addEventListener('click', () => {
      const text = textarea.value;
      if (!text) { showToast('⚠ ' + tr('Nothing to paste')); return; }
      showToast('⏳ ' + tr('Pasting {count} characters…').replace('{count}', text.length), canvas);
      sendTextWithStoredDelay(canvas, text);
    });

    // ── Snippets view ──
    const snipsView = document.createElement('div');
    snipsView.className = 'vcpa-view';
    snipsView.id = 'vcpa-snips-view';

    const snipsScroll = document.createElement('div');
    snipsScroll.className = 'vcpa-snip-scroll';

    const snipsFooter = document.createElement('div');
    snipsFooter.className = 'vcpa-snip-footer';
    const snipsFooterInner = document.createElement('div');
    snipsFooterInner.className = 'vcpa-snip-footer-inner';
    snipsFooterInner.innerHTML = '<span class="vcpa-snip-hint">' + tr('Drag to reorder snippets') + '</span>';
    const newSnipBtn = document.createElement('button');
    newSnipBtn.type = 'button';
    newSnipBtn.className = 'vcpa-snip-new-btn';
    newSnipBtn.textContent = tr('+ New snippet');
    snipsFooter.appendChild(snipsFooterInner);
    snipsFooter.appendChild(newSnipBtn);

    snipsView.appendChild(snipsScroll);
    snipsView.appendChild(snipsFooter);

    // ── Edit popover (child of panel, positioned absolutely) ──
    const editPop = document.createElement('div');
    editPop.id = 'vcpa-edit-pop';

    const popHdr = document.createElement('div');
    popHdr.className = 'vcpa-pop-hdr';
    const popTitle = document.createElement('span');
    popTitle.className = 'vcpa-pop-title';
    popTitle.id = 'vcpa-edit-pop-title';
    const popX = document.createElement('button');
    popX.type = 'button';
    popX.className = 'vcpa-pop-x';
    popX.textContent = '\u2715';
    popHdr.appendChild(popTitle);
    popHdr.appendChild(popX);

    const popBody = document.createElement('div');
    popBody.className = 'vcpa-pop-body';

    const nameField = document.createElement('div');
    const nameLbl = document.createElement('div');
    nameLbl.className = 'vcpa-field-lbl';
    nameLbl.textContent = tr('Name');
    const nameIn = document.createElement('input');
    nameIn.type = 'text';
    nameIn.className = 'vcpa-field-in';
    nameField.appendChild(nameLbl);
    nameField.appendChild(nameIn);

    const contentField = document.createElement('div');
    const contentLbl = document.createElement('div');
    contentLbl.className = 'vcpa-field-lbl';
    contentLbl.textContent = tr('Content');
    const contentTa = document.createElement('textarea');
    contentTa.className = 'vcpa-field-ta';
    contentField.appendChild(contentLbl);
    contentField.appendChild(contentTa);

    popBody.appendChild(nameField);
    popBody.appendChild(contentField);

    const popFtr = document.createElement('div');
    popFtr.className = 'vcpa-pop-ftr';
    const popCancel = document.createElement('button');
    popCancel.type = 'button';
    popCancel.className = 'vcpa-pop-cancel';
    popCancel.textContent = tr('Cancel');
    const popSave = document.createElement('button');
    popSave.type = 'button';
    popSave.className = 'vcpa-pop-save';
    popSave.textContent = tr('Save changes');
    popFtr.appendChild(popCancel);
    popFtr.appendChild(popSave);

    editPop.appendChild(popHdr);
    editPop.appendChild(popBody);
    editPop.appendChild(popFtr);
    // Prevent host-page and outside-click handlers from consuming editor interaction.
    editPop.addEventListener('click', (event) => event.stopPropagation());
    editPop.addEventListener('pointerdown', (event) => event.stopPropagation());

    // ── Popover state ──
    let editingId = null;
    let editingRow = null;
    let editingPencil = null;

    function openPopover(snippet, rowEl, pencilEl) {
      if (editingRow) {
        editingRow.classList.remove('editing');
        if (editingPencil) editingPencil.classList.remove('active');
      }
      editingId     = snippet.id;
      editingRow    = rowEl;
      editingPencil = pencilEl;
      rowEl.classList.add('editing');
      pencilEl.classList.add('active');
      nameIn.value    = snippet.name || '';
      contentTa.value = snippet.text || '';
      popTitle.textContent = tr('Edit Snippet');

      editPop.classList.add('open');
      setTimeout(() => nameIn.focus(), 40);
    }

    function openPopoverForNew() {
      if (editingRow) {
        editingRow.classList.remove('editing');
        if (editingPencil) editingPencil.classList.remove('active');
      }
      editingId = editingRow = editingPencil = null;
      nameIn.value = '';
      contentTa.value = '';
      popTitle.textContent = tr('New Snippet');

      editPop.classList.add('open');
      setTimeout(() => nameIn.focus(), 40);
    }

    newSnipBtn.addEventListener('click', openPopoverForNew);

    function closePopover() {
      editPop.classList.remove('open');
      if (editingRow)    editingRow.classList.remove('editing');
      if (editingPencil) editingPencil.classList.remove('active');
      editingId = editingRow = editingPencil = null;
    }

    popX.addEventListener('click', closePopover);
    popCancel.addEventListener('click', closePopover);
    popSave.addEventListener('click', async () => {
      const name = nameIn.value.trim();
      const text = contentTa.value;
      if (!name) { showToast('⚠ ' + tr('Name required')); return; }
      if (!text.trim()) { showToast('⚠ ' + tr('Content required')); return; }
      if (editingId) {
        await saveSnippet({ id: editingId, name, text });
        showToast('✓ ' + tr('Snippet updated'));
      } else {
        await saveSnippet({ name, text });
        showToast('✓ ' + tr('Snippet added'));
      }
      closePopover();
      await renderSnippets();
    });
    nameIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); contentTa.focus(); }
      if (e.key === 'Escape') closePopover();
    });
    contentTa.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePopover();
    });

    // Close popover on outside click (ignore click on the button that opened it)
    document.addEventListener('click', (e) => {
      if (!editPop.classList.contains('open')) return;
      const target = e.target;
      const clickedOpener = editingRow ? editingRow.contains(target) : newSnipBtn.contains(target);
      if (!editPop.contains(target) && !clickedOpener) closePopover();
    });

    // ── Render snippets list ──
    async function renderSnippets() {
      const snippets = await getSnippets();
      snipsScroll.innerHTML = '';

      if (snippets.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'vcpa-snip-empty';
        empty.textContent = tr('No snippets yet. Click “+ New snippet” below or use the Paste tab to save from clipboard.');
        snipsScroll.appendChild(empty);
        return;
      }

      for (let i = 0; i < snippets.length; i++) {
        const s = snippets[i];
        const row = document.createElement('div');
        row.className = 'vcpa-snip-row';
        row.dataset.snippetIndex = String(i);
        row.dataset.snippetId = s.id;

        const dragHandle = document.createElement('div');
        dragHandle.className = 'vcpa-snip-drag-handle';
        dragHandle.innerHTML = GRIP;
        dragHandle.title = tr('Drag to reorder');
        dragHandle.draggable = true;
        dragHandle.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', String(i));
          e.dataTransfer.effectAllowed = 'move';
          row.classList.add('dragging');
        });
        dragHandle.addEventListener('dragend', () => {
          snipsScroll.querySelectorAll('.vcpa-snip-row').forEach((r) => {
            r.classList.remove('dragging');
            r.classList.remove('drag-over');
          });
        });

        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!row.classList.contains('dragging')) row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', (e) => {
          if (!row.contains(e.relatedTarget)) row.classList.remove('drag-over');
        });
        row.addEventListener('drop', async (e) => {
          e.preventDefault();
          row.classList.remove('drag-over');
          const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
          const toIndex = parseInt(row.dataset.snippetIndex, 10);
          if (fromIndex === toIndex) return;
          await reorderSnippets(fromIndex, toIndex);
          await renderSnippets();
        });

        const info = document.createElement('div');
        info.className = 'vcpa-snip-info';
        const nameEl = document.createElement('div');
        nameEl.className = 'vcpa-snip-name';
        nameEl.textContent = s.name || 'Unnamed';
        const preview = document.createElement('div');
        preview.className = 'vcpa-snip-preview';
        const previewText = (s.text || '').replace(/\r?\n/g, ' ').trim();
        preview.textContent = previewText.length > 52 ? previewText.slice(0, 49) + '\u2026' : previewText;
        info.appendChild(nameEl);
        info.appendChild(preview);

        const actions = document.createElement('div');
        actions.className = 'vcpa-snip-actions';

        const sendEl = document.createElement('button');
        sendEl.type = 'button';
        sendEl.className = 'vcpa-snip-send';
        sendEl.textContent = tr('Send');
        sendEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!s.text) return;
          showToast('⏳ ' + tr('Pasting {count} characters…').replace('{count}', s.text.length));
          sendTextWithStoredDelay(canvas, s.text);
        });

        const editEl = document.createElement('button');
        editEl.type = 'button';
        editEl.className = 'vcpa-snip-edit';
        editEl.title = tr('Edit');
        editEl.innerHTML = PENCIL;
        editEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (editingId === s.id) {
            closePopover();
          } else {
            openPopover(s, row, editEl);
          }
        });

        const delEl = document.createElement('button');
        delEl.type = 'button';
        delEl.className = 'vcpa-snip-del';
        delEl.title = tr('Delete');
        delEl.textContent = '\u2715';
        delEl.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (editingId === s.id) closePopover();
          await deleteSnippet(s.id);
          await renderSnippets();
          showToast(tr('Snippet deleted'));
        });

        const actionsExtra = document.createElement('div');
        actionsExtra.className = 'vcpa-snip-actions-extra';
        actionsExtra.appendChild(delEl);
        actionsExtra.appendChild(editEl);
        actions.appendChild(actionsExtra);
        actions.appendChild(sendEl);
        row.appendChild(dragHandle);
        row.appendChild(info);
        row.appendChild(actions);
        snipsScroll.appendChild(row);
      }
    }

    // ── Tab switching ──
    function setTab(tab) {
      const isPaste = tab === 'paste';
      pasteTab.classList.toggle('active', isPaste);
      snipsTab.classList.toggle('active', !isPaste);
      pasteView.classList.toggle('active', isPaste);
      snipsView.classList.toggle('active', !isPaste);
      if (isPaste) textarea.focus();
      else renderSnippets();
    }

    pasteTab.addEventListener('click', () => setTab('paste'));
    snipsTab.addEventListener('click', () => setTab('snippets'));

    // ── Collapsed pill ──
    const btnRow = document.createElement('div');
    btnRow.id = 'vcpa-btns';
    btnRow.title = tr('Open paste panel');

    const pillIcon = document.createElement('div');
    pillIcon.className = 'vcpa-pill-icon';
    pillIcon.title = tr('Paste clipboard into VM') + ' (' + shortcutLabel + ')';
    pillIcon.innerHTML = CLIP_LG;
    pillIcon.addEventListener('click', (e) => { e.stopPropagation(); pasteClipboard(canvas); });

    const pillChev = document.createElement('div');
    pillChev.className = 'vcpa-pill-chev';
    pillChev.innerHTML = CHEV_UP;
    pillChev.addEventListener('click', (e) => { e.stopPropagation(); openPanel(); });

    btnRow.appendChild(pillIcon);
    btnRow.appendChild(pillChev);

    // ── Assemble ──
    panel.appendChild(titleBar);
    panel.appendChild(header);
    panel.appendChild(pasteView);
    panel.appendChild(snipsView);
    panel.appendChild(editPop); // sibling of views, positioned absolute within panel

    // Standalone ESXi console windows/tabs install document-level keyboard
    // handlers that may forward every keystroke to the VM, even when an
    // extension input owns focus. Keep keyboard events originating inside the
    // assistant UI inside the panel. Target-level handlers (Enter/Escape in the
    // snippet editor) still run because stopPropagation does not suppress other
    // listeners on the same element.
    ['keydown', 'keypress', 'keyup'].forEach(function (eventName) {
      panel.addEventListener(eventName, function (event) {
        const target = event.target;
        if (target && target.closest && target.closest('input, textarea, [contenteditable="true"]')) {
          event.stopPropagation();
        }
      });
    });

    wrap.appendChild(panel);
    wrap.appendChild(btnRow);

    const consoleContainer = findConsoleContainer(canvas);
    if (consoleContainer && consoleContainer !== document.body) {
      const containerStyle = window.getComputedStyle(consoleContainer);
      if (containerStyle.position === 'static') {
        consoleContainer.style.position = 'relative';
        consoleContainer.dataset.vcpaPositionAdjusted = 'true';
      }
      consoleContainer.appendChild(wrap);
    } else {
      // Fallback for unusual standalone console documents.
      wrap.style.position = 'fixed';
      document.body.appendChild(wrap);
    }

    // The panel is created dynamically inside the vCenter page. Translate only
    // the extension-owned subtree so the host vCenter UI is never modified.
    if (window.VCenterPasteI18n) {
      window.VCenterPasteI18n.translateElement(wrap);
    }

    function applyPanelPosition(w) {
      storageGet(PANEL_POSITION_KEY).then(function (pos) {
        const p = (pos === 'bottom-left' || pos === 'top-right' || pos === 'top-left') ? pos : 'bottom-right';
        const px = '16px';
        w.style.top = w.style.bottom = w.style.left = w.style.right = 'auto';
        if (p === 'bottom-right') { w.style.bottom = px; w.style.right = px; }
        else if (p === 'bottom-left') { w.style.bottom = px; w.style.left = px; }
        else if (p === 'top-right') { w.style.top = px; w.style.right = px; }
        else { w.style.top = px; w.style.left = px; }
        w.style.alignItems = (p === 'bottom-right' || p === 'top-right') ? 'flex-end' : 'flex-start';
      });
    }
    applyPanelPosition(wrap);

    storageGet(PANEL_OPEN_KEY).then(function (open) {
      if (open) openPanel();
    });

    // ── Panel open / close ──
    function openPanel() {
      panel.classList.add('open');
      setTab('paste');
      btnRow.style.display = 'none';
    }

    function closePanel() {
      panel.classList.remove('open');
      btnRow.style.display = 'flex';
      closePopover();
      closeSaveBar();
    }

    hdrClose.addEventListener('click', closePanel);
    return wrap;
  }

  // Keyboard shortcut: native paste (Ctrl+V / Cmd+V). Resolve the active
  // canvas at keypress time because ESXi destroys and recreates WebMKS when a
  // console window is closed and opened again without reloading the page.
  function injectHotkey() {
    document.addEventListener('keydown', function (e) {
      if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v')) return;
      const canvas = findConsoleCanvas();
      const target = e.target;
      // Never hijack normal browser/page paste. WebMKS paste is handled only
      // when the active keyboard target is the visible console canvas.
      if (!canvas || (target !== canvas && document.activeElement !== canvas)) return;
      if (!shortcutPasteEnabled || !canvas.isConnected) return;
      e.preventDefault();
      e.stopPropagation();
      pasteClipboard(canvas);
    }, true);
  }

  // Insert text into a focused input, textarea, or contenteditable (for popup paste on any page).
  function pasteIntoFocusedElement(text) {
    const el = document.activeElement;
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName && el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      const start = el.selectionStart != null ? el.selectionStart : el.value.length;
      const end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
      const before = (el.value || '').slice(0, start);
      const after = (el.value || '').slice(end);
      el.value = before + text + after;
      el.selectionStart = el.selectionEnd = start + text.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (el.isContentEditable) {
      document.execCommand('insertText', false, text);
      return true;
    }
    return false;
  }

  // Handle messages from popup: paste text into the page (WebMKS canvas or focused input/textarea).
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
      if (msg.action !== 'paste' && msg.action !== 'sendText') return;
      const text = msg.action === 'sendText' && typeof msg.text === 'string' ? msg.text : null;
      if (msg.action === 'sendText' && !text) {
        sendResponse({ ok: false, error: tr('No text to paste.') });
        return false;
      }

      function tryHandle() {
        const canvas = findConsoleCanvas();
        if (canvas && msg.action === 'sendText') {
          sendTextWithStoredDelay(canvas, text);
          sendResponse({ ok: true, status: 'started' });
          return true;
        }
        if (canvas && msg.action === 'paste') {
          pasteClipboard(canvas).then(function () {
            sendResponse({ ok: true });
          }).catch(function () {
            sendResponse({ ok: false, error: tr('Clipboard access denied or empty.') });
          });
          return true;
        }
        if (msg.action === 'sendText' && pasteIntoFocusedElement(text)) {
          sendResponse({ ok: true });
          return true;
        }
        return false;
      }

      if (msg.action === 'sendText' && text) {
        if (tryHandle()) return;
        setTimeout(function () {
          if (tryHandle()) return;
          sendResponse({ ok: false, error: tr('No target to paste into. Focus a WebMKS console or a text field in the tab.') });
        }, 150);
        return true;
      }
      if (tryHandle()) return true;
      setTimeout(function () {
        if (tryHandle()) return;
        sendResponse({ ok: false, error: tr('No target to paste into. Focus a WebMKS console or a text field in the tab.') });
      }, 150);
      return true;
    });
  }

  // Maintain the integration for the lifetime of the ESXi/vCenter SPA. Host
  // Client removes the console canvas and its container when the draggable
  // console is closed, then creates a new canvas when another console opens.
  let initializationStarted = false;
  let activeConsoleCanvas = null;
  let consoleLifecycleObserver = null;
  let consoleLifecycleTimer = null;
  let lifecycleCheckPending = false;

  function ensureConsoleIntegration() {
    lifecycleCheckPending = false;
    const canvas = findConsoleCanvas();
    const existingWrap = document.getElementById('vcpa-wrap');

    if (!canvas || !canvas.isConnected) {
      // A wrapper normally disappears with its console container. Remove a
      // fallback wrapper attached to body as well, so the next console starts cleanly.
      if (existingWrap && (!activeConsoleCanvas || !activeConsoleCanvas.isConnected)) {
        existingWrap.remove();
      }
      if (activePasteTask && (!activePasteTask.canvas || !activePasteTask.canvas.isConnected)) {
        cancelActivePaste('disconnected');
      }
      activeConsoleCanvas = null;
      return;
    }

    const consoleIsRecognized = hasExplicitConsoleMarker(canvas) ||
      (isVsphereConsole() && isElementVisible(canvas));
    if (!consoleIsRecognized) return;

    if (existingWrap && activeConsoleCanvas === canvas) return;

    // Remove a stale UI and stop any task bound to the replaced console.
    if (activeConsoleCanvas && activeConsoleCanvas !== canvas) cancelActivePaste('disconnected');
    if (existingWrap) existingWrap.remove();
    injectButton(canvas);
    activeConsoleCanvas = canvas;
  }

  function scheduleLifecycleCheck() {
    if (lifecycleCheckPending) return;
    lifecycleCheckPending = true;
    setTimeout(ensureConsoleIntegration, 50);
  }

  function init() {
    if (initializationStarted) return;
    // Do not require the canvas to exist at document_idle. ESXi 7/8 mounts it
    // only after the user opens the console, commonly in an initially empty
    // child frame. The observer below performs the strict canvas check before
    // injecting any UI.
    if (!isPotentialVmwareContext() &&
        !document.querySelector('canvas#mainCanvas, .vmConsole, .webmks, #webmks')) return;
    initializationStarted = true;
    storageGet(SHORTCUT_PASTE_ENABLED_KEY).then(function (enabled) {
      shortcutPasteEnabled = enabled !== false;
    });
    try {
      if (chrome && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function (changes, areaName) {
          if (areaName === 'local' && changes[SHORTCUT_PASTE_ENABLED_KEY]) {
            shortcutPasteEnabled = changes[SHORTCUT_PASTE_ENABLED_KEY].newValue !== false;
          }
        });
      }
    } catch (_error) {}
    injectHotkey();

    // MutationObserver reacts immediately to draggable console close/open and
    // canvas replacement. The interval is a low-cost fallback for framework
    // changes that do not produce an observable mutation in this frame.
    consoleLifecycleObserver = new MutationObserver(scheduleLifecycleCheck);
    consoleLifecycleObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    consoleLifecycleTimer = setInterval(ensureConsoleIntegration, 1000);
    ensureConsoleIntegration();
  }

  function initWhenI18nReady() {
    if (window.VCenterPasteI18n && typeof window.VCenterPasteI18n.onReady === 'function') {
      window.VCenterPasteI18n.onReady(init);
    } else {
      init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenI18nReady);
  } else {
    initWhenI18nReady();
  }
})();
