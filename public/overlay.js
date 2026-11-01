// Página del overlay. No dispara ingestas: solo lee lo que el server ya trajo.
//
// Fuente de datos, en orden de preferencia:
//   1. ?api=<url> (override manual, para probar)
//   2. public/config.js (window.OVERLAY_CONFIG.api) — lo que usa GitHub Pages
//   3. mismo origen — lo que usa OBS apuntando a http://127.0.0.1:4001/
(() => {
  const REFRESH_MS = 10_000;
  const params = new URLSearchParams(location.search);
  const configured = params.get('api') || (window.OVERLAY_CONFIG && window.OVERLAY_CONFIG.api) || '';

  const strip = (value) => String(value || '').replace(/\/+$/, '');
  const isLocalPage = ['127.0.0.1', 'localhost', ''].includes(location.hostname);

  // En OBS (localhost) conviene el server local; en Pages, el túnel.
  const preferred = [isLocalPage ? strip(location.origin) : strip(configured)];
  const candidates = [];
  for (const url of [strip(configured), strip(location.origin), ...preferred]) {
    if (url && !candidates.includes(url)) candidates.push(url);
  }

  let apiBase = candidates[0] || strip(location.origin);

  const el = {
    overlay: document.getElementById('overlay'),
    icon: document.getElementById('rank-icon'),
    tier: document.getElementById('rank-tier'),
    wins: document.getElementById('wins'),
    losses: document.getElementById('losses'),
    draws: document.getElementById('draws'),
    status: document.getElementById('status'),
  };

  let appliedIcon = null;

  function setNumber(node, value) {
    const text = String(Number.isFinite(value) ? value : 0);
    if (node.textContent !== text) node.textContent = text;
  }

  function apply(info) {
    setNumber(el.wins, info.wins);
    setNumber(el.losses, info.losses);
    setNumber(el.draws, info.draws);

    el.tier.textContent = info.rankName || 'Unranked';

    if (info.rankIcon) {
      if (appliedIcon !== info.rankIcon) {
        // El icono lo sirve la API: en GitHub Pages el sitio vive bajo /<repo>/
        // y una ruta absoluta /ranks/... daría 404.
        el.icon.src = new URL(info.rankIcon, `${apiBase}/`).href;
        el.icon.alt = info.rankName || '';
        el.icon.hidden = false;
        appliedIcon = info.rankIcon;
      }
    } else {
      el.icon.hidden = true;
      el.icon.removeAttribute('src');
      appliedIcon = null;
    }

    el.overlay.dataset.state = 'ok';
    el.status.title = info.lastMatchAt
      ? `Last match: ${new Date(info.lastMatchAt).toLocaleString('en-US')}`
      : 'No matches recorded yet';
  }

  function markError(message) {
    el.overlay.dataset.state = 'error';
    el.status.title = `API unreachable: ${message}`;
  }

  async function fetchOverlay() {
    let lastError = new Error('sin API configurada');

    for (const base of [apiBase, ...candidates.filter((url) => url !== apiBase)]) {
      try {
        const response = await fetch(`${base}/api/overlay`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const info = await response.json();
        apiBase = base;
        return info;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  async function refresh() {
    try {
      apply(await fetchOverlay());
    } catch (error) {
      markError(error && error.message ? error.message : String(error));
    } finally {
      setTimeout(refresh, REFRESH_MS);
    }
  }

  // Si falta el PNG del rango, se muestra solo el nombre del tier.
  el.icon.addEventListener('error', () => {
    el.icon.hidden = true;
    appliedIcon = null;
  });

  refresh();
})();
