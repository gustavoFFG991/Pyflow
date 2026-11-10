(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const $ = id => document.getElementById(id);
  const vp = $('vp'), inner = $('inner'), msg = $('msg');
  let MM = '', SW = 0, SH = 0, uid = 0;

  function showMsg(t, err) {
    inner.innerHTML = ''; msg.hidden = false; msg.className = err ? 'err' : ''; msg.textContent = t; MM = '';
  }

  if (window.NO_MERMAID) {
    showMsg('Mermaid não encontrado. Na pasta da extensão, execute “npm install” e recarregue a janela.', true);
  } else {
    mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict', flowchart: { htmlLabels: false, curve: 'basis', useMaxWidth: false } });
  }

  /* ---------- Abas ---------- */
  function tab(mode) {
    const g = mode !== 'steps';
    $('pG').hidden = !g; $('pS').hidden = g;
    $('tG').setAttribute('aria-selected', g); $('tS').setAttribute('aria-selected', !g);
    if (g && SW) resetView();
  }
  $('tG').onclick = () => tab('flow');
  $('tS').onclick = () => tab('steps');

  /* ---------- Renderização ---------- */
  async function render(m) {
    const ol = $('steps'); ol.innerHTML = '';
    if (m.empty) { showMsg('Nenhum comando reconhecido neste arquivo.'); SW = 0; return; }
    m.steps.forEach((r, i) => {
      const li = document.createElement('li');
      li.style.paddingLeft = (r.d * 22) + 'px';
      const b = document.createElement('b'); b.textContent = i + 1;
      const sp = document.createElement('span'); sp.textContent = r.t;
      li.append(b, sp); ol.append(li);
    });
    if (window.NO_MERMAID) return;
    MM = m.mermaid;
    const id = 'pf' + (++uid);
    try {
      const { svg } = await mermaid.render(id, MM);
      msg.hidden = true; inner.innerHTML = svg;
      const el = inner.querySelector('svg'), vb = el.viewBox.baseVal;
      SW = vb.width; SH = vb.height;
      el.setAttribute('width', SW); el.setAttribute('height', SH); el.style.maxWidth = 'none';
      if (!firstDone) { resetView(); firstDone = true; } else apply();
    } catch (e) {
      const z = document.getElementById('d' + id); if (z) z.remove();
      showMsg('Não foi possível gerar o fluxograma para este código.', true);
    }
  }
  let firstDone = false;

  window.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'update') { tab(m.mode); render(m); }
    else if (m.type === 'mode') tab(m.mode);
  });

  /* ---------- Zoom / pan ---------- */
  const V = { s: 1, x: 0, y: 0 };
  function apply() { inner.style.transform = `translate(${V.x}px,${V.y}px) scale(${V.s})`; $('zl').textContent = Math.round(V.s * 100) + '%'; }
  function resetView() {
    V.s = Math.min(1, (vp.clientWidth - 32) / (SW || 1));
    V.x = Math.max(16, (vp.clientWidth - SW * V.s) / 2); V.y = 16; apply();
  }
  function zoomAt(f, cx, cy) {
    const ns = Math.min(4, Math.max(0.2, V.s * f)), k = ns / V.s;
    V.x = cx - (cx - V.x) * k; V.y = cy - (cy - V.y) * k; V.s = ns; apply();
  }
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  let dr = null;
  vp.addEventListener('pointerdown', e => { dr = { x: e.clientX - V.x, y: e.clientY - V.y }; vp.setPointerCapture(e.pointerId); vp.classList.add('drag'); });
  vp.addEventListener('pointermove', e => { if (!dr) return; V.x = e.clientX - dr.x; V.y = e.clientY - dr.y; apply(); });
  ['pointerup', 'pointercancel'].forEach(ev => vp.addEventListener(ev, () => { dr = null; vp.classList.remove('drag'); }));
  $('zIn').onclick = () => zoomAt(1.2, vp.clientWidth / 2, vp.clientHeight / 2);
  $('zOut').onclick = () => zoomAt(1 / 1.2, vp.clientWidth / 2, vp.clientHeight / 2);
  $('zRst').onclick = resetView;
  window.addEventListener('resize', () => { if (SW && !dr && !$('pG').hidden) resetView(); });

  /* ---------- Exportar ---------- */
  function svgText() {
    const el = inner.querySelector('svg'); if (!el) return null;
    const c = el.cloneNode(true);
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#ffffff');
    c.insertBefore(bg, c.firstChild);
    return new XMLSerializer().serializeToString(c);
  }
  $('xSvg').onclick = () => {
    const s = svgText();
    if (!s) return vscode.postMessage({ type: 'error', text: 'Gere um fluxograma primeiro.' });
    vscode.postMessage({ type: 'save', kind: 'svg', text: s });
  };
  $('xPng').onclick = () => {
    const s = svgText();
    if (!s) return vscode.postMessage({ type: 'error', text: 'Gere um fluxograma primeiro.' });
    const img = new Image();
    img.onload = () => {
      const k = 2, cv = document.createElement('canvas');
      cv.width = (SW + 40) * k; cv.height = (SH + 40) * k;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(img, 20 * k, 20 * k, SW * k, SH * k);
      vscode.postMessage({ type: 'save', kind: 'png', data: cv.toDataURL('image/png').split(',')[1] });
    };
    img.onerror = () => vscode.postMessage({ type: 'error', text: 'Falha ao gerar o PNG.' });
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  };
  $('xMm').onclick = () => {
    if (!MM) return vscode.postMessage({ type: 'error', text: 'Gere um fluxograma primeiro.' });
    vscode.postMessage({ type: 'copy', text: MM });
  };

  vscode.postMessage({ type: 'ready' });
})();
