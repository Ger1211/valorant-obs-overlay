// Configuración de la página del overlay.
//
// `api`: de dónde lee los datos cuando la página NO está servida por el propio
// server (por ejemplo en GitHub Pages). Acá va la URL del túnel.
// Si se deja vacío, la página usa el mismo origen (sirve para OBS apuntando a
// http://127.0.0.1:4001/).
//
// El túnel "quick" cambia de URL cada vez que se reinicia: cuando pase, se
// actualiza esta línea y se hace push (GitHub Pages republica solo).
window.OVERLAY_CONFIG = {
  api: 'https://oral-fighting-ala-glasgow.trycloudflare.com',
};
