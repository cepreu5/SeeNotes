/* CX Notes: use the original rendered note color as the neon accent.
   Does not modify saved notes, JSON or graphic-background preferences. */
(() => {
  'use strict';
  const selector = '#notes-container .note:not(.boards-note):not(.note-item)';
  const rgb = (value) => {
    if (!value) return null;
    const match = value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i);
    if (match) {
      if (match[4] !== undefined && Number(match[4]) === 0) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    }
    const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!hex) return null;
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  };
  const colorFrom = (el) => {
    const style = getComputedStyle(el);
    let c = rgb(style.backgroundColor) || rgb(el.style.backgroundColor);
    if (!c) {
      const sample = document.createElement('span');
      sample.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
      sample.style.background = el.style.background || style.backgroundImage;
      el.appendChild(sample);
      c = rgb(getComputedStyle(sample).backgroundColor);
      sample.remove();
    }
    return c || [35, 195, 255];
  };
  const hsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
    let h = 195, s = 1;
    if (d > 0.015) {
      switch(max) {
        case r: h = ((g-b)/d) % 6; break;
        case g: h = (b-r)/d + 2; break;
        default: h = (r-g)/d + 4;
      }
      h = ((h*60)%360+360)%360;
      const l=(max+min)/2;
      s=d/(1-Math.abs(2*l-1));
    }
    return [Math.round(h), Math.max(65, Math.round(s*100))];
  };
  const apply = (note) => {
    if (note.classList.contains('cx-neon-ready')) return;
    const [h, s] = hsl(colorFrom(note));
    note.style.setProperty('--cx-note-h', String(h));
    note.style.setProperty('--cx-note-s', s + '%');
    note.classList.add('cx-neon-ready');
  };
  const scan = (root) => {
    if (root.matches?.(selector)) apply(root);
    root.querySelectorAll?.(selector + ':not(.cx-neon-ready)').forEach(apply);
  };
  const start = () => {
    const host = document.getElementById('notes-container');
    if (!host) return;
    scan(host);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'childList') {
          record.addedNodes.forEach(node => { if (node.nodeType === 1) scan(node); });
        } else if (record.type === 'attributes') {
          const note = record.target;
          if (note.matches?.(selector) && note.classList.contains('cx-neon-ready')) {
            // Re-evaluate only when the app itself changes the inline background.
            const current = note.style.backgroundColor + '|' + note.style.background;
            if (current !== note.dataset.cxSourceBackground) {
              note.classList.remove('cx-neon-ready');
              apply(note);
            }
          }
        }
      }
    });
    observer.observe(host, {childList:true, subtree:true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();


/* Keep the app-wide "Graphical background (note)" preference authoritative
   after note edits/re-renders. Missing key means OFF, matching app defaults. */
(() => {
  'use strict';
  const enabled = () => localStorage.getItem('imgBgrd') === 'true';
  const sync = () => {
    const on = enabled();
    document.body.classList.toggle('cx-img-bgrd-off', !on);
    document.querySelectorAll('.note-window .modal-content-box').forEach(box => {
      if (on) {
        box.classList.remove('no-bg-image');
      } else {
        box.classList.add('no-bg-image');
        box.style.backgroundImage = 'none';
      }
    });
  };
  const observe = () => {
    sync();
    document.addEventListener('change', event => {
      if (event.target && event.target.id === 'img-bgrd-checkbox') {
        // Let the app persist the checkbox value first, then re-apply the visual state.
        Promise.resolve().then(sync);
      }
    }, true);
    window.addEventListener('storage', event => {
      if (event.key === 'imgBgrd') sync();
    });
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList' && record.addedNodes.length)) sync();
    });
    observer.observe(document.body, {childList:true, subtree:true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe);
  else observe();
})();
