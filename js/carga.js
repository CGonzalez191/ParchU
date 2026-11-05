// Pantalla de carga: sale solo la primera vez que se abre ParchU en la pestaña.
// Es un script normal (no módulo) para que corra antes de pintar la página
// y no se alcance a ver la página "desnuda" un instante.
(() => {
  const CLAVE = 'parchu_cargado';
  try {
    if (sessionStorage.getItem(CLAVE)) return;
    sessionStorage.setItem(CLAVE, '1');
  } catch { /* sin almacenamiento: se muestra igual */ }

  const raiz = document.documentElement;
  raiz.classList.add('cargando');          // el ::before tapa la página mientras llega el <body>

  const MINIMO = 1300;   // ms que se ve el logo, aunque todo cargue antes
  const MAXIMO = 4000;   // ms máximos de espera si algo tarda
  const inicio = performance.now();
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', () => {
    const carga = document.createElement('div');
    carga.className = 'carga';
    carga.setAttribute('role', 'status');
    carga.setAttribute('aria-label', 'Cargando ParchU');
    carga.innerHTML = `
      <div class="carga__centro">
        <img class="carga__logo" src="img/logo.png" alt="" width="160" height="160">
        <p class="carga__nombre">Parch<span>U</span></p>
        <p class="carga__lema">Lo de Montería, en un solo lugar</p>
      </div>
      <div class="trenza" aria-hidden="true"></div>`;
    document.body.prepend(carga);
    raiz.classList.remove('cargando');

    let listo = false;
    const revelar = () => {
      if (listo) return;
      listo = true;
      const espera = Math.max(0, MINIMO - (performance.now() - inicio));
      setTimeout(() => {
        if (sinMovimiento) { carga.remove(); return; }
        carga.addEventListener('animationend', () => carga.remove(), { once: true });
        setTimeout(() => carga.remove(), 1500);   // por si el navegador no dispara animationend
        document.body.classList.add('revelando');
        carga.classList.add('carga--sale');
        setTimeout(() => document.body.classList.remove('revelando'), 1500);
      }, espera);
    };

    if (document.readyState === 'complete') revelar();
    else addEventListener('load', revelar, { once: true });
    setTimeout(revelar, MAXIMO);
  });
})();
