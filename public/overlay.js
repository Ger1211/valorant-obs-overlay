// Página del overlay. No dispara ingestas: solo lee lo que el server ya trajo.
//
// De dónde lee, en orden de preferencia:
//   - servida por el propio server (OBS en 127.0.0.1/localhost): primero el
//     mismo origen, y el túnel sólo como respaldo. OBS nunca depende de internet.
//   - servida desde GitHub Pages: primero config.json (el túnel), y el mismo
//     origen como respaldo.
//   - ?api=<url> siempre gana, para probar a mano.
//
// config.json se pide con cache: 'no-store': Pages cachea 10 minutos y con un
// túnel nuevo la página quedaba apuntando al viejo para siempre.
(() => {
  const REFRESH_MS = 10_000;
  const FETCH_TIMEOUT_MS = 4_000;

  const el = {
    overlay: document.getElementById('overlay'),
    icon: document.getElementById('rank-icon'),
    tier: document.getElementById('rank-tier'),
    wins: document.getElementById('wins'),
    losses: document.getElementById('losses'),
    draws: document.getElementById('draws'),
    status: document.getElementById('status'),
  };

  let apiBase = '';
  let appliedIcon = null;

  function strip(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  /** fetch con timeout: un candidato muerto no puede bloquear el respaldo. */
  async function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { cache: 'no-store', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function readConfig() {
    try {
      const response = await fetchWithTimeout('./config.json', FETCH_TIMEOUT_MS);
      if (!response.ok) return '';
      const data = await response.json();
      return typeof data?.api === 'string' ? data.api : '';
    } catch {
      return '';
    }
  }

  async function resolveCandidates() {
    const fromQuery = new URLSearchParams(location.search).get('api') || '';
    const fromConfig = await readConfig();
    const origin = strip(location.origin);
    const isLocal = ['127.0.0.1', 'localhost', ''].includes(location.hostname);

    const order = isLocal ? [fromQuery, origin, fromConfig] : [fromQuery, fromConfig, origin];

    const candidates = [];
    for (const raw of order) {
      const url = strip(raw);
      if (url && !candidates.includes(url)) candidates.push(url);
    }
    return candidates;
  }

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

  /** La pantalla no puede quedarse mintiendo con "Loading…" cuando falla. */
  function markOffline(message) {
    if (el.tier.textContent === 'Loading…') el.tier.textContent = 'Offline';
    el.overlay.dataset.state = 'error';
    el.status.title = `API unreachable: ${message}`;
  }

  async function fetchOverlay(candidates) {
    let lastError = new Error('no API configured');

    for (const base of [apiBase, ...candidates.filter((url) => url !== apiBase)]) {
      if (!base) continue;
      try {
        const response = await fetchWithTimeout(`${base}/api/overlay`, FETCH_TIMEOUT_MS);
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

  async function refresh(candidates) {
    try {
      apply(await fetchOverlay(candidates));
    } catch (error) {
      markOffline(error && error.message ? error.message : String(error));
    } finally {
      setTimeout(() => refresh(candidates), REFRESH_MS);
    }
  }

  // Si falta el PNG del rango, se muestra solo el nombre del tier.
  el.icon.addEventListener('error', () => {
    el.icon.hidden = true;
    appliedIcon = null;
  });

  resolveCandidates().then((candidates) => {
    apiBase = candidates[0] || strip(location.origin);
    return refresh(candidates);
  });
})();
