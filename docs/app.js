(() => {
  'use strict';
  const q = selector => document.querySelector(selector);
  const qa = selector => [...document.querySelectorAll(selector)];
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const channels = new WeakMap(), running = new Set();
  function motion(element, frames, options = {}, channel = 'default') {
    let own = channels.get(element);
    if (!own) { own = new Map(); channels.set(element, own); }
    own.get(channel)?.cancel();
    if (preference.matches || !element.animate) return Promise.resolve();
    const animation = element.animate(frames, {duration: 200, easing: 'ease-out', ...options});
    own.set(channel, animation); running.add(animation);
    return animation.finished.catch(() => {}).finally(() => {
      running.delete(animation);
      if (own.get(channel) === animation) own.delete(channel);
    });
  }
  function stopMotion(element) { channels.get(element)?.forEach(animation => animation.cancel()); }
  const reduceMotion = () => { if (preference.matches) running.forEach(animation => animation.cancel()); };
  if (preference.addEventListener) preference.addEventListener('change', reduceMotion);
  else preference.addListener?.(reduceMotion);

  q('#read-paper')?.addEventListener('click', event => {
    if (event.currentTarget.getAttribute('aria-disabled') === 'true') event.preventDefault();
  });

  // Highlight only while the explanation is hovered or deliberately keyboard-focused.
  function highlightMethod(triggers, figure) {
    let hovered = null, focused = null;
    const regions = [...figure.querySelectorAll('[data-link-region]')];
    const refresh = () => {
      const key = hovered || focused;
      regions.forEach(region => region.classList.toggle('is-active', region.dataset.linkRegion === key));
      triggers.forEach(trigger => {
        const active = trigger.dataset.linkKey === key;
        trigger.classList.toggle('is-active', active);
        trigger.closest('article').classList.toggle('is-active', active);
      });
    };
    triggers.forEach(trigger => {
      const key = trigger.dataset.linkKey, target = trigger.closest('article');
      target.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'touch') { focused = null; hovered = key; refresh(); }
      });
      target.addEventListener('pointerleave', () => { hovered = focused = null; refresh(); });
      trigger.addEventListener('pointerdown', () => { focused = null; refresh(); });
      trigger.addEventListener('focus', () => { if (trigger.matches(':focus-visible')) { focused = key; refresh(); } });
      trigger.addEventListener('blur', () => { if (focused === key) focused = null; refresh(); });
      trigger.addEventListener('keydown', event => {
        if (event.key === 'Escape') { hovered = focused = null; refresh(); }
      });
    });
    window.addEventListener('blur', () => { hovered = focused = null; refresh(); });
  }
  highlightMethod(qa('.method-step-trigger'), q('#method-figure'));

  const state = {setting: 'cross', scale: '400'};
  function selectGroup(selector, key, value) {
    qa(selector).forEach(button => {
      const active = button.dataset[key] === String(value);
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  // Keep row identities and grouping fixed; replace only the measured values.
  const resultRows = new Map();
  const groups = [
    {name: 'End-to-end', id: 'end-to-end', start: 0, end: 4},
    {name: 'Retrieval-based', id: 'retrieval-based', start: 4, end: 7},
    {name: 'Search-based', id: 'search-based', start: 7, end: 10}
  ];
  groups.forEach(group => {
    const body = document.createElement('tbody');
    body.className = `approach-group ${group.id}`; body.setAttribute('aria-label', group.name);
    const rows = window.RESULTS.cross.slice(group.start, group.end);
    rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      if (index === 0) tr.classList.add('group-start');
      if (row.method === 'RingMatch') tr.classList.add('ours');
      else if (row.method.startsWith('RingMatch')) tr.classList.add('search-row');
      if (index === 0) {
        const approach = document.createElement('th');
        approach.scope = 'rowgroup'; approach.rowSpan = rows.length;
        approach.className = 'approach-cell'; approach.textContent = group.name; tr.append(approach);
      }
      const method = document.createElement('th');
      method.scope = 'row'; method.className = 'method-cell'; method.textContent = row.method; tr.append(method);
      const metrics = ['mean', 'median'].map(key => {
        const cell = document.createElement('td'), value = document.createElement('span');
        cell.className = 'metric-cell'; value.className = 'metric-value'; cell.append(value); tr.append(cell);
        return {key, cell, value};
      });
      resultRows.set(row.method, metrics); body.append(tr);
    });
    q('#results-table').append(body);
  });
  function renderResults(animate = false) {
    const {setting, scale} = state, rows = window.RESULTS[setting];
    const label = setting === 'cross' ? 'Cross-area' : 'Same-area';
    q('#table-caption').textContent = `VIGOR-Pro · ${label} · ${scale} m`;
    rows.forEach(row => resultRows.get(row.method).forEach(({key, cell, value}) => {
      const next = row.values[scale][key].toFixed(2), changed = value.textContent !== next;
      value.textContent = next;
      if (animate && changed) {
        motion(value, [{opacity: .4}, {opacity: 1}]);
        if (row.method === 'RingMatch') motion(cell, [{backgroundColor: '#d7e6c6'}, {backgroundColor: getComputedStyle(cell).backgroundColor}], {duration: 420}, 'emphasis');
      }
    }));
    const ours = rows.find(row => row.method === 'RingMatch').values[scale];
    const baseline = rows.find(row => row.method === 'Sample4Geo + FG²').values[scale];
    q('#result-summary').textContent = `With ${scale} m aerial regions under ${label.toLowerCase()} evaluation, RingMatch achieves ${ours.mean.toFixed(2)} m mean and ${ours.median.toFixed(2)} m median error, compared with ${baseline.mean.toFixed(2)} m and ${baseline.median.toFixed(2)} m for Sample4Geo + FG².`;
    if (animate) motion(q('#result-summary'), [{opacity: .45}, {opacity: 1}]);
  }
  ['setting', 'scale'].forEach(key => qa(`[data-${key}]`).forEach(button => button.addEventListener('click', () => {
    if (state[key] === button.dataset[key]) return;
    state[key] = button.dataset[key]; selectGroup(`[data-${key}]`, key, state[key]); renderResults(true);
  })));
  renderResults();

  // Decode first and discard stale downloads when examples are selected rapidly.
  const imageCache = new Map();
  function loadImage(src) {
    if (imageCache.has(src)) return imageCache.get(src);
    const promise = new Promise((resolve, reject) => {
      const image = new Image(); image.decoding = 'async';
      image.onload = async () => { try { await image.decode?.(); } catch {} resolve(image); };
      image.onerror = () => { imageCache.delete(src); reject(new Error('Image unavailable')); };
      image.src = src;
    });
    imageCache.set(src, promise); return promise;
  }
  const caseImage = q('#case-image'), caseButton = q('#case-enlarge'), exampleButtons = qa('[data-case]');
  let currentCase = exampleButtons.find(button => button.classList.contains('selected')).dataset.case, caseVersion = 0;
  function selectExample(id) {
    exampleButtons.forEach(button => {
      const selected = button.dataset.case === id;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    });
  }
  function clearCaseTransition() {
    stopMotion(caseImage);
    caseButton.querySelectorAll('.case-previous').forEach(image => { stopMotion(image); image.remove(); });
  }
  async function showExample(button, index) {
    const version = ++caseVersion, id = button.dataset.case;
    clearCaseTransition(); q('#example-status').textContent = '';
    exampleButtons.forEach(other => other.classList.remove('is-loading'));
    if (id === currentCase) { caseButton.setAttribute('aria-busy', 'false'); return; }
    button.classList.add('is-loading'); caseButton.setAttribute('aria-busy', 'true');
    try {
      const loaded = await loadImage(`assets/depth_ring_case_${id}.webp`);
      if (version !== caseVersion) return;
      let previous;
      if (!preference.matches && caseImage.complete && caseImage.naturalWidth) {
        previous = caseImage.cloneNode(false); previous.removeAttribute('id');
        previous.className = 'case-previous'; previous.setAttribute('aria-hidden', 'true'); caseButton.append(previous);
      }
      caseImage.src = loaded.src;
      caseImage.alt = `Example ${index + 1}: ground panorama, aerial candidates and depth-ring comparisons from the paper`;
      caseButton.dataset.image = `assets/depth_ring_case_${id}.png`;
      currentCase = id; selectExample(id);
      button.classList.remove('is-loading'); caseButton.setAttribute('aria-busy', 'false');
      const incoming = previous ? Promise.resolve() : motion(caseImage, [{opacity: 0}, {opacity: 1}], {duration: 220});
      if (previous) await Promise.all([incoming, motion(previous, [{opacity: 1}, {opacity: 0}], {duration: 220})]);
      else await incoming;
      previous?.remove();
    } catch {
      if (version !== caseVersion) return;
      button.classList.remove('is-loading'); caseButton.setAttribute('aria-busy', 'false');
      q('#example-status').textContent = 'Unable to load this example. Please try again.';
    }
  }
  exampleButtons.forEach((button, index) => {
    button.addEventListener('click', () => showExample(button, index));
    ['pointerenter', 'focus'].forEach(event => button.addEventListener(event, () => {
      loadImage(`assets/depth_ring_case_${button.dataset.case}.webp`).catch(() => {});
    }));
  });

  const dialog = q('#image-dialog'), dialogImage = dialog.querySelector('img');
  let dialogVersion = 0;
  async function openFigure(button) {
    const version = ++dialogVersion, preview = button.querySelector('img');
    dialogImage.src = preview.currentSrc || preview.src; dialogImage.alt = preview.alt;
    if (!dialog.open) dialog.showModal();
    try {
      const highResolution = await loadImage(button.dataset.image);
      if (version === dialogVersion && dialog.open) dialogImage.src = highResolution.src;
    } catch {} // The already-visible preview remains usable.
  }
  function closeFigure() {
    if (!dialog.open) return;
    ++dialogVersion;
    dialog.close();
  }
  qa('[data-image]').forEach(button => button.addEventListener('click', () => openFigure(button)));
  q('.dialog-close').addEventListener('click', closeFigure);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeFigure(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeFigure();
  });

  q('#copy-citation').addEventListener('click', async () => {
    const code = q('#citation-code').textContent;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(code);
      q('#copy-citation').textContent = 'Copied'; q('#citation-status').textContent = 'BibTeX copied to clipboard.';
    } catch {
      const range = document.createRange(); range.selectNodeContents(q('#citation-code'));
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      q('#copy-citation').textContent = 'Text selected'; q('#citation-status').textContent = 'Use your copy shortcut to copy the selected BibTeX.';
    }
  });
})();
