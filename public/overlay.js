// Pagina del overlay. No dispara ingestas: solo lee lo que el server ya trajo.
// Base de la API: ?api=https://<tunel> o el mismo origen (OBS en localhost).
(() => {
  const REFRESH_MS = 10_000;
  const params = new URLSearchParams(location.search);

  // Prioridad: ?api= de la URL > <meta name="overlay-api"> > mismo origen.
  const metaApi = document.querySelector('meta[name="overlay-api"]');
  const configuredApi = metaApi && metaApi.getAttribute('content');
  const apiBase = (params.get('api') || configuredApi || location.origin).replace(/\/+$/, '');

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
        // El icono lo sirve la API, no la pagina: en GitHub Pages el sitio vive
        // bajo /<repo>/ y una ruta absoluta /ranks/... daria 404.
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
    el.status.title = info.lastMatchAt ? `Última partida: ${new Date(info.lastMatchAt).toLocaleString('es-AR')}` : 'Sin partidas registradas';
  }

  function markError(message) {
    el.overlay.dataset.state = 'error';
    el.status.title = `Sin conexión con la API: ${message}`;
  }

  async function refresh() {
    try {
      const response = await fetch(`${apiBase}/api/overlay`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      apply(await response.json());
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
