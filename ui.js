/* Theme and responsive panel controls. Preferences stay in this browser. */
(() => {
  'use strict';
  const root = document.documentElement, $ = id => document.getElementById(id);
  const read = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  function applyTheme(theme) {
    root.dataset.theme = theme;
    const dark = theme === 'dark';
    $('theme-toggle').textContent = dark ? '☀ Light mode' : '☾ Dark mode';
    $('theme-toggle').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    $('theme-toggle').setAttribute('aria-pressed', String(dark));
    document.querySelector('meta[name="theme-color"]').content = dark ? '#0b101b' : '#f3f6fb';
    window.dispatchEvent(new Event('kg-theme-change'));
  }
  applyTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');
  $('theme-toggle').onclick = () => {
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme); save('kg-theme', theme);
  };
  const ratios = {};
  for (const side of ['left', 'right']) {
    const value = Number(read(`kg-panel-${side}`));
    ratios[side] = value >= .1 && value <= .5 ? value : null;
  }
  const wide = () => matchMedia('(min-width: 1101px) and (min-aspect-ratio: 1/1)').matches;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rem = () => parseFloat(getComputedStyle(root).fontSize);
  function panelBounds(side) {
    const unit = rem(), other = side === 'left' ? $('details') : $('filters');
    const otherWidth = side === 'left' && !wide() ? 0 : other.getBoundingClientRect().width;
    const min = (side === 'left' ? 14 : 16) * unit;
    const max = Math.max(min, Math.min(innerWidth * .38, 32 * unit, innerWidth - otherWidth - 18 * unit - unit));
    return {min, max};
  }
  function updateAria(side) {
    const handle = $(`resize-${side}`), panel = side === 'left' ? $('filters') : $('details'), bounds = panelBounds(side);
    handle.setAttribute('aria-valuemin', Math.round(bounds.min));
    handle.setAttribute('aria-valuemax', Math.round(bounds.max));
    handle.setAttribute('aria-valuenow', Math.round(panel.getBoundingClientRect().width));
    handle.setAttribute('aria-valuetext', `${Math.round(panel.getBoundingClientRect().width)} pixels`);
  }
  function setWidth(side, pixels, persist = true) {
    const {min,max} = panelBounds(side), value = clamp(pixels,min,max);
    root.style.setProperty(`--${side}-width`, `${value}px`);
    if (persist) { ratios[side] = value / innerWidth; save(`kg-panel-${side}`, String(ratios[side])); }
    updateAria(side);
  }
  function reset(side) {
    ratios[side] = null; save(`kg-panel-${side}`, ''); root.style.removeProperty(`--${side}-width`); updateAria(side);
  }
  function applySizes() {
    // Return to fluid defaults at each breakpoint before applying saved proportions.
    for (const side of ['left','right']) root.style.removeProperty(`--${side}-width`);
    if (innerWidth > 760) {
      if (ratios.left) setWidth('left',ratios.left*innerWidth,false);
      if (ratios.right && wide()) setWidth('right',ratios.right*innerWidth,false);
    }
    for (const side of ['left','right']) updateAria(side);
  }
  for (const side of ['left','right']) {
    const handle = $(`resize-${side}`), panel = side === 'left' ? $('filters') : $('details');
    let drag = null;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      drag = {x: event.clientX, width: panel.getBoundingClientRect().width, id: event.pointerId};
      handle.setPointerCapture(event.pointerId); handle.classList.add('resizing'); document.body.classList.add('resizing-panels');
      event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      setWidth(side,drag.width + (event.clientX-drag.x)*(side==='left'?1:-1));
    });
    const finish = () => { drag = null; handle.classList.remove('resizing'); document.body.classList.remove('resizing-panels'); };
    handle.addEventListener('pointerup',finish); handle.addEventListener('pointercancel',finish); handle.addEventListener('lostpointercapture',finish);
    handle.addEventListener('dblclick',()=>reset(side));
    handle.addEventListener('keydown',event=>{
      if (event.key==='Home') { event.preventDefault(); reset(side); return; }
      if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const direction = (event.key==='ArrowRight'?1:-1)*(side==='left'?1:-1);
      setWidth(side,panel.getBoundingClientRect().width+direction*(event.shiftKey?50:20));
    });
  }
  new ResizeObserver(entries => {
    root.style.setProperty('--header-height', `${entries[0].target.getBoundingClientRect().height}px`);
  }).observe(document.querySelector('.topbar'));
  window.addEventListener('resize',applySizes);
  applySizes();
})();
