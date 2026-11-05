// Sesión del usuario y encabezado según su rol.
import { supabase } from './supabase.js';
import { esc, iniciales } from './util.js';

let perfilEnCache;

/** Usuario con sesión iniciada, o null. */
export async function obtenerUsuario() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/** Perfil (nombre, rol…) del usuario actual, o null si no ha iniciado sesión. */
export async function obtenerPerfil({ recargar = false } = {}) {
  if (perfilEnCache !== undefined && !recargar) return perfilEnCache;
  const usuario = await obtenerUsuario();
  if (!usuario) return (perfilEnCache = null);
  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', usuario.id)
    .single();
  if (error) console.error('No se pudo cargar el perfil', error);
  return (perfilEnCache = data ?? null);
}

/**
 * Para páginas privadas: si no hay sesión, manda a iniciar sesión.
 * Con `roles`, además exige uno de esos roles.
 */
export async function exigirSesion(roles) {
  const perfil = await obtenerPerfil();
  if (!perfil) {
    const volver = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    location.replace(`login.html?volver=${volver}`);
    return null;
  }
  if (roles && !roles.includes(perfil.rol)) {
    location.replace('index.html');
    return null;
  }
  return perfil;
}

export async function cerrarSesion() {
  await supabase.auth.signOut();
  perfilEnCache = undefined;
  location.href = 'index.html';
}

/** Rellena el bloque [data-cuenta] del encabezado según quién esté conectado. */
export async function pintarEncabezado() {
  const cont = document.querySelector('[data-cuenta]');
  if (!cont) return;

  const perfil = await obtenerPerfil();

  if (!perfil) {
    cont.innerHTML = `
      <a class="cuenta__enlace cuenta__enlace--opcional" href="login.html?modo=registro">Vende en ParchU</a>
      <a class="boton boton--principal" href="login.html">Iniciar sesión</a>`;
    return;
  }

  // Enlaces según el rol
  const enlaces = [];
  if (perfil.rol === 'admin') {
    enlaces.push(['admin.html', 'Administración']);
  }
  if (perfil.rol === 'vendedor') {
    enlaces.push(['vendedor.html', 'Mi tienda']);
  }
  enlaces.push(['mis-pedidos.html', 'Mis pedidos', perfil.rol !== 'comprador']);
  enlaces.push(['mensajes.html', 'Mensajes']);
  if (perfil.rol === 'comprador') {
    enlaces.push(['vendedor.html', 'Abrir mi tienda', true]);
  }

  const avatar = perfil.avatar_url
    ? `<img src="${esc(perfil.avatar_url)}" alt="">`
    : esc(iniciales(perfil.nombre));

  cont.innerHTML = `
    ${enlaces
      .map(([href, texto, opcional]) =>
        `<a class="cuenta__enlace${opcional ? ' cuenta__enlace--opcional' : ''}" href="${href}">${texto}</a>`)
      .join('')}
    <span class="cuenta__usuario">
      <span class="avatar" title="${esc(perfil.nombre)}">${avatar}</span>
      <button class="boton boton--suave" type="button" data-salir>Salir</button>
    </span>`;

  cont.querySelector('[data-salir]').addEventListener('click', cerrarSesion);
}

// Si la sesión cambia en otra pestaña, refrescar el encabezado.
supabase.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT' || evento === 'SIGNED_IN') {
    perfilEnCache = undefined;
  }
});

// ---------------------------------------------------------
// Encabezado que se desliza: se esconde al bajar y vuelve al subir.
// ---------------------------------------------------------
function encabezadoDeslizable() {
  const barra = document.querySelector('.encabezado');
  if (!barra) return;

  let ultimaY = scrollY;

  const actualizar = () => {
    const y = Math.max(0, scrollY);
    const delta = y - ultimaY;
    if (Math.abs(delta) < 6) return;                 // ignora temblores del dedo
    const ocultar = delta > 0 && y > barra.offsetHeight + 40
      && !barra.contains(document.activeElement);     // no esconder si se está usando
    barra.classList.toggle('encabezado--oculto', ocultar);
    ultimaY = y;
  };

  // El navegador ya agrupa los eventos de scroll por cuadro; el trabajo es mínimo
  addEventListener('scroll', actualizar, { passive: true });

  // Al navegar con teclado, si el foco entra al encabezado, que aparezca
  barra.addEventListener('focusin', () => barra.classList.remove('encabezado--oculto'));
}
encabezadoDeslizable();
