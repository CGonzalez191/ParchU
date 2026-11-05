// Funciones pequeñas que usan varias páginas.

const formatoPesos = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
});

/** 8000 → "$ 8.000" */
export function pesos(valor) {
  return formatoPesos.format(Number(valor) || 0);
}

/** Evita que texto escrito por usuarios se interprete como HTML. */
export function esc(texto) {
  return String(texto ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** "Dulce Tentación" → "DT" */
export function iniciales(nombre) {
  return String(nombre ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase() || '?';
}

/** Color estable a partir de un texto (para portadas sin foto). */
const COLORES = [
  ['#FFE3CF', '#9E370A'], // naranja
  ['#FFF4D6', '#8A5D00'], // mango
  ['#FDE4DF', '#9C2A23'], // corozo
  ['#E7EEF8', '#24497A'], // cielo
  ['#F3E9F6', '#6B2D7C'], // flor
  ['#EAF0DF', '#4A6118'], // plátano
];
export function colorDe(texto) {
  let h = 0;
  for (const c of String(texto ?? '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}

/** Lee un parámetro de la URL: ?slug=dulce-tentacion */
export function parametro(nombre) {
  return new URLSearchParams(location.search).get(nombre);
}

/** Aviso flotante breve. */
export function avisar(mensaje, tipo = 'ok') {
  document.querySelector('.aviso')?.remove();
  const el = document.createElement('div');
  el.className = `aviso${tipo === 'error' ? ' aviso--error' : ''}`;
  el.setAttribute('role', 'status');
  el.textContent = mensaje;
  document.body.append(el);
  setTimeout(() => el.classList.add('aviso--saliendo'), 3200);
  setTimeout(() => el.remove(), 3500);
}

/**
 * Cambia la página "transformándola": lo que tiene nombre de transición
 * (view-transition-name) se desliza de su lugar viejo al nuevo, en vez de
 * cortarse. `tipo` agrega la clase .vt-<tipo> al <html> durante el cambio para
 * que estilos.css decida qué se anima (lista, pestana, acceso, chat…).
 * `direccion` ('adelante' | 'atras') sirve para deslizar hacia un lado u otro.
 * Si el navegador no lo soporta o se pidió menos movimiento, solo actualiza.
 * Devuelve una promesa que se cumple cuando la página ya cambió:
 * true si hubo transición, false si no.
 */
let transicionActual = null;
export function transicion(actualizar, { tipo = 'cambio', direccion = 'adelante' } = {}) {
  const raiz = document.documentElement;
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || sinMovimiento || document.hidden) {
    actualizar();
    return Promise.resolve(false);
  }
  // Si había otra en curso, se reemplaza su tipo por el nuevo
  raiz.className = raiz.className.replace(/\bvt-\S+/g, '').trim();
  raiz.classList.add('vt', `vt-${tipo}`);
  raiz.dataset.direccion = direccion;

  const t = document.startViewTransition(actualizar);
  transicionActual = t;
  // Si llega otro cambio muy rápido, el anterior se salta: no es un error
  t.ready.catch(() => {});
  t.finished.catch(() => {}).finally(() => {
    if (transicionActual !== t) return;
    raiz.classList.remove('vt', `vt-${tipo}`);
    delete raiz.dataset.direccion;
  });
  return t.updateCallbackDone.then(() => true, () => true);
}

/** Atributo para que una tarjeta se deslice a su nuevo lugar al cambiar la lista. */
export function nombreVT(prefijo, id) {
  return `style="--vt-nombre: ${prefijo}-${String(id).replace(/[^\w-]/g, '-')}"`;
}

/**
 * Hace aparecer en cascada los hijos de una lista (clase .entrada en estilos.css).
 * Por defecto solo la primera vez que se llama para ese contenedor, para que
 * las actualizaciones en tiempo real o del carrito no repitan la animación.
 * Con `repetir = true` se vuelve a animar (por ejemplo, al cambiar un filtro).
 */
const yaAnimados = new WeakSet();
export function animarEntrada(contenedor, repetir = false) {
  if (!contenedor || (yaAnimados.has(contenedor) && !repetir)) return;
  yaAnimados.add(contenedor);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  contenedor.classList.remove('entrada');
  void contenedor.offsetWidth; // reinicia la animación
  contenedor.classList.add('entrada');
  clearTimeout(contenedor._finEntrada);
  contenedor._finEntrada = setTimeout(() => contenedor.classList.remove('entrada'), 1100);
}

/** Traduce los errores más comunes de Supabase. */
export function traducirError(error) {
  const m = error?.message ?? String(error ?? '');
  const traducciones = [
    [/Invalid login credentials/i, 'Correo o contraseña incorrectos.'],
    [/Email not confirmed/i, 'Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.'],
    [/User already registered/i, 'Ya existe una cuenta con ese correo. Inicia sesión.'],
    [/Password should be at least/i, 'La contraseña debe tener al menos 6 caracteres.'],
    [/Unable to validate email|invalid format|Email address .* is invalid/i, 'El correo no es válido. Revisa que esté bien escrito.'],
    // Registro: problemas con el envío del correo de confirmación
    [/not authorized|cannot be used as it is not authorized/i,
      'Por ahora no podemos enviar el correo de confirmación a esa dirección. Escríbenos y te ayudamos a crear la cuenta.'],
    [/Error sending (confirmation|magic link|recovery)? ?e?mail/i,
      'No pudimos enviarte el correo de confirmación. Inténtalo de nuevo en unos minutos.'],
    [/email rate limit/i,
      'Se han creado muchas cuentas en poco tiempo. Espera unos minutos e inténtalo de nuevo.'],
    [/Signups not allowed|signup.*disabled/i, 'El registro de cuentas nuevas está cerrado por ahora.'],
    [/Database error saving new user/i, 'No pudimos guardar tu cuenta. Inténtalo de nuevo; si sigue fallando, escríbenos.'],
    [/rate limit|too many/i, 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'],
    [/Failed to fetch|NetworkError/i, 'No hay conexión con el servidor. Revisa tu internet o la configuración en js/config.js.'],
  ];
  for (const [patron, texto] of traducciones) if (patron.test(m)) return texto;
  return m || 'Algo salió mal. Inténtalo de nuevo.';
}

export const ICONO_ESTRELLA =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>';
