// Página principal: explorar emprendimientos.
import { supabase } from './supabase.js';
import { pintarEncabezado, obtenerPerfil } from './sesion.js';
import { esc, pesos, iniciales, colorDe, traducirError, ICONO_ESTRELLA, animarEntrada, transicion, nombreVT } from './util.js';

const $categorias = document.getElementById('categorias');
const $tiendas    = document.getElementById('tiendas');
const $conteo     = document.getElementById('conteo');
const $buscar     = document.getElementById('buscar');
const $formBuscar = document.getElementById('formBuscar');

const estado = {
  categorias: [],
  tiendas: [],
  categoria: null,   // id de la categoría elegida (null = todas)
  texto: '',
};

// ---------------------------------------------------------
// Cargar datos
// ---------------------------------------------------------
async function cargar() {
  pintarEsqueleto();

  const [cats, tiendas] = await Promise.all([
    supabase.from('categorias').select('id, nombre, slug, icono').order('orden'),
    supabase
      .from('tiendas')
      .select(`
        id, nombre, slug, descripcion, logo_url, portada_url, barrio, abierta,
        hace_domicilio, permite_recoger, costo_domicilio, tiempo_entrega_min,
        calificacion_promedio, total_resenas, categoria_id,
        categorias ( nombre, icono )
      `)
      .eq('estado', 'aprobada'),
  ]);

  if (cats.error || tiendas.error) {
    pintarError(cats.error || tiendas.error);
    return;
  }

  estado.categorias = cats.data;
  estado.tiendas = tiendas.data;

  pintarCategorias();
  pintarTiendas();
  animarEntrada($categorias);
  animarEntrada($tiendas);
}

// ---------------------------------------------------------
// Categorías
// ---------------------------------------------------------
function pintarCategorias() {
  const chips = [{ id: null, nombre: 'Todo', icono: '' }, ...estado.categorias];
  $categorias.innerHTML = chips
    .map((c) => `
      <button class="chip" type="button" data-categoria="${c.id ?? ''}"
              aria-pressed="${estado.categoria === c.id}">
        ${c.icono ? `<span aria-hidden="true">${esc(c.icono)}</span>` : ''}${esc(c.nombre)}
      </button>`)
    .join('');
}

$categorias.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-categoria]');
  if (!chip) return;
  const id = chip.dataset.categoria ? Number(chip.dataset.categoria) : null;
  estado.categoria = estado.categoria === id ? null : id;
  transicion(() => { pintarCategorias(); pintarTiendas(); }, { tipo: 'lista' });
});

// ---------------------------------------------------------
// Búsqueda (se filtra mientras escribes)
// ---------------------------------------------------------
function normalizar(t) {
  return String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

$buscar.addEventListener('input', () => {
  estado.texto = $buscar.value;
  pintarTiendas();
});
$formBuscar.addEventListener('submit', (e) => {
  e.preventDefault();
  estado.texto = $buscar.value;
  pintarTiendas();
  document.getElementById('tituloTiendas').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function tiendasFiltradas() {
  const q = normalizar(estado.texto.trim());
  return estado.tiendas
    .filter((t) => estado.categoria === null || t.categoria_id === estado.categoria)
    .filter((t) => {
      if (!q) return true;
      const donde = normalizar([t.nombre, t.descripcion, t.barrio, t.categorias?.nombre].join(' '));
      return donde.includes(q);
    })
    // Abiertas primero, luego mejor calificadas
    .sort((a, b) =>
      Number(b.abierta) - Number(a.abierta) ||
      b.calificacion_promedio - a.calificacion_promedio ||
      b.total_resenas - a.total_resenas);
}

// ---------------------------------------------------------
// Tarjetas
// ---------------------------------------------------------
function tarjetaTienda(t) {
  const [fondo, tinta] = colorDe(t.nombre);

  const imagen = t.portada_url
    ? `<img src="${esc(t.portada_url)}" alt="" loading="lazy">`
    : `<div class="tienda__sin-foto" style="background:${fondo}" aria-hidden="true">${esc(t.categorias?.icono ?? '🛍️')}</div>`;

  const logo = t.logo_url
    ? `<img src="${esc(t.logo_url)}" alt="">`
    : `<span style="color:${tinta}">${esc(iniciales(t.nombre))}</span>`;

  const calificacion = t.total_resenas > 0
    ? `<span class="calificacion" title="${t.total_resenas} reseñas">${ICONO_ESTRELLA}${Number(t.calificacion_promedio).toFixed(1)}</span>`
    : `<span class="calificacion calificacion--nueva">Nueva</span>`;

  let entrega;
  if (t.hace_domicilio) {
    entrega = t.costo_domicilio > 0 ? `Domicilio ${pesos(t.costo_domicilio)}` : 'Domicilio gratis';
  } else {
    entrega = 'Para recoger';
  }

  return `
    <a class="tienda con-vt${t.abierta ? '' : ' tienda--cerrada'}" ${nombreVT('tienda', t.id)} href="tienda.html?slug=${encodeURIComponent(t.slug)}">
      <div class="tienda__imagen">
        ${imagen}
        ${t.abierta ? '' : '<span class="tienda__estado">Cerrada ahora</span>'}
      </div>
      <div class="tienda__info">
        <div class="tienda__logo">${logo}</div>
        <div>
          <h3 class="tienda__nombre">${esc(t.nombre)} ${calificacion}</h3>
          <p class="tienda__datos">
            <span>${esc(t.categorias?.nombre ?? 'Emprendimiento')}</span>
            <span>${t.tiempo_entrega_min} min</span>
            <span>${entrega}</span>
          </p>
        </div>
      </div>
    </a>`;
}

function pintarTiendas() {
  const lista = tiendasFiltradas();
  $conteo.textContent = estado.tiendas.length
    ? `${lista.length} ${lista.length === 1 ? 'emprendimiento' : 'emprendimientos'}`
    : '';

  if (estado.tiendas.length === 0) {
    $tiendas.innerHTML = `
      <div class="vacio" style="grid-column:1/-1">
        <h3>Todavía no hay emprendimientos publicados</h3>
        <p>Cuando administración apruebe las primeras tiendas, aparecerán aquí.</p>
        <a class="boton boton--principal" href="login.html?modo=registro">Abrir la primera tienda</a>
      </div>`;
    return;
  }

  if (lista.length === 0) {
    $tiendas.innerHTML = `
      <div class="vacio" style="grid-column:1/-1">
        <h3>Nada coincide con tu búsqueda</h3>
        <p>Prueba con otra palabra o elige otra categoría.</p>
        <button class="boton boton--suave" type="button" id="limpiar">Ver todos los emprendimientos</button>
      </div>`;
    document.getElementById('limpiar').addEventListener('click', () => {
      estado.texto = '';
      estado.categoria = null;
      $buscar.value = '';
      transicion(() => { pintarCategorias(); pintarTiendas(); }, { tipo: 'lista' });
    });
    return;
  }

  $tiendas.innerHTML = lista.map(tarjetaTienda).join('');
}

function pintarEsqueleto() {
  $tiendas.innerHTML = Array.from({ length: 6 }, () => `
    <div class="tienda esqueleto" aria-hidden="true">
      <div class="tienda__imagen"></div>
      <div class="linea-gris" style="width:70%"></div>
      <div class="linea-gris" style="width:45%"></div>
    </div>`).join('');
}

function pintarError(error) {
  console.error(error);
  $tiendas.innerHTML = `
    <div class="vacio" style="grid-column:1/-1">
      <h3>No se pudieron cargar los emprendimientos</h3>
      <p>${esc(traducirError(error))}</p>
      <button class="boton boton--principal" type="button" onclick="location.reload()">Intentar de nuevo</button>
    </div>`;
}

// ---------------------------------------------------------
// El bloque "¿Tienes un emprendimiento?" cambia según el usuario
// ---------------------------------------------------------
async function ajustarBloqueVender() {
  const perfil = await obtenerPerfil();
  const enlace = document.getElementById('enlaceVender');
  if (!perfil) return;
  if (perfil.rol === 'comprador') {
    enlace.href = 'vendedor.html';
  } else {
    document.getElementById('bloqueVender').classList.add('oculto');
  }
}

pintarEncabezado();
ajustarBloqueVender();
cargar();
