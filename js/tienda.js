// Página de un emprendimiento: productos, reseñas, carrito y pedido.
import { supabase } from './supabase.js';
import { pintarEncabezado, obtenerPerfil } from './sesion.js';
import {
  esc, pesos, iniciales, colorDe, parametro, avisar, traducirError, ICONO_ESTRELLA, animarEntrada,
} from './util.js';
import { preguntar } from './comun.js';

const $contenido = document.getElementById('contenido');
const $barra     = document.getElementById('abrirCarrito');
const $modal     = document.getElementById('modalListo');

const METODOS = [
  ['efectivo',    'Efectivo'],
  ['nequi',       'Nequi'],
  ['bancolombia', 'Bancolombia'],
  ['daviplata',   'Daviplata'],
];

const estado = {
  tienda: null,
  productos: [],
  resenas: [],
  perfil: null,
  carrito: {},          // { producto_id: cantidad }
  enviando: false,
};

// ---------------------------------------------------------
// Carrito guardado en el navegador (uno por tienda)
// ---------------------------------------------------------
const claveCarrito = () => `parchu_carrito_${estado.tienda.id}`;

function leerCarrito() {
  try { estado.carrito = JSON.parse(localStorage.getItem(claveCarrito())) || {}; }
  catch { estado.carrito = {}; }
  // Quitar productos que ya no existen o no están disponibles
  for (const id of Object.keys(estado.carrito)) {
    const p = producto(id);
    if (!p || !disponible(p)) delete estado.carrito[id];
    else if (p.stock !== null && estado.carrito[id] > p.stock) estado.carrito[id] = p.stock;
  }
}
function guardarCarrito() {
  try { localStorage.setItem(claveCarrito(), JSON.stringify(estado.carrito)); } catch { /* sin almacenamiento */ }
}

const producto   = (id) => estado.productos.find((p) => p.id === id);
const disponible = (p) => p.disponible && (p.stock === null || p.stock > 0);
const lineas     = () => Object.entries(estado.carrito)
  .map(([id, cantidad]) => ({ p: producto(id), cantidad }))
  .filter((l) => l.p);

function cambiarCantidad(id, delta) {
  const p = producto(id);
  if (!p) return;
  const actual = estado.carrito[id] || 0;
  let nueva = actual + delta;
  if (p.stock !== null && nueva > p.stock) {
    avisar(`Solo hay ${p.stock} disponibles`, 'error');
    nueva = p.stock;
  }
  if (nueva <= 0) delete estado.carrito[id];
  else estado.carrito[id] = nueva;
  guardarCarrito();
  pintarProductos();
  pintarCarrito();
}

// ---------------------------------------------------------
// Cargar datos
// ---------------------------------------------------------
async function cargar() {
  const slug = parametro('slug');
  if (!slug) return pintarNoEncontrada();

  const { data: tienda, error } = await supabase
    .from('tiendas')
    .select('*, categorias ( nombre, icono )')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return pintarError(error);
  if (!tienda) return pintarNoEncontrada();

  estado.tienda = tienda;
  document.title = `${tienda.nombre} · ParchU`;

  const [productos, resenas, perfil] = await Promise.all([
    supabase.from('productos').select('*').eq('tienda_id', tienda.id)
      .order('orden').order('created_at'),
    supabase.from('resenas')
      .select('id, calificacion, comentario, respuesta, created_at, perfiles ( nombre )')
      .eq('tienda_id', tienda.id)
      .order('created_at', { ascending: false })
      .limit(20),
    obtenerPerfil(),
  ]);

  if (productos.error) return pintarError(productos.error);

  estado.productos = productos.data;
  estado.resenas   = resenas.data ?? [];
  estado.perfil    = perfil;

  leerCarrito();
  pintarPagina();
}

// ---------------------------------------------------------
// Página
// ---------------------------------------------------------
const esDuenio = () => estado.perfil && estado.perfil.id === estado.tienda.propietario_id;

function pintarPagina() {
  const t = estado.tienda;
  const [fondo, tinta] = colorDe(t.nombre);

  const portada = t.portada_url
    ? `<img src="${esc(t.portada_url)}" alt="">`
    : `<div class="tienda__sin-foto" style="background:${fondo}" aria-hidden="true">${esc(t.categorias?.icono ?? '🛍️')}</div>`;

  const logo = t.logo_url
    ? `<img src="${esc(t.logo_url)}" alt="">`
    : `<span style="color:${tinta}">${esc(iniciales(t.nombre))}</span>`;

  const calificacion = t.total_resenas > 0
    ? `<a class="calificacion" href="#resenas">${ICONO_ESTRELLA}${Number(t.calificacion_promedio).toFixed(1)}
         <span class="calificacion__total">(${t.total_resenas} ${t.total_resenas === 1 ? 'reseña' : 'reseñas'})</span></a>`
    : '<span class="calificacion calificacion--nueva">Nueva en ParchU</span>';

  const datos = [
    `Entrega en ${t.tiempo_entrega_min} min aprox.`,
    t.hace_domicilio
      ? (t.costo_domicilio > 0 ? `Domicilio ${pesos(t.costo_domicilio)}` : 'Domicilio gratis')
      : null,
    t.permite_recoger ? 'Puedes recoger' : null,
    t.barrio ? `Barrio ${t.barrio}` : null,
    t.horario || null,
  ].filter(Boolean);

  let avisoEstado = '';
  if (t.estado !== 'aprobada') {
    const textos = {
      pendiente: 'Tu tienda está en revisión. Los clientes la verán cuando administración la apruebe.',
      rechazada: `Tu tienda no fue aprobada.${t.motivo_rechazo ? ` Motivo: ${t.motivo_rechazo}` : ''}`,
      suspendida: `Tu tienda está suspendida.${t.motivo_rechazo ? ` Motivo: ${t.motivo_rechazo}` : ''}`,
    };
    avisoEstado = `<div class="alerta alerta--error">${esc(textos[t.estado])}</div>`;
  } else if (esDuenio()) {
    avisoEstado = '<div class="alerta alerta--ok">Así ven tu tienda los clientes. Para editarla ve a <a href="vendedor.html">Mi tienda</a>.</div>';
  }

  $contenido.innerHTML = `
    ${avisoEstado ? `<div class="aviso-tienda">${avisoEstado}</div>` : ''}

    <section class="perfil-tienda${t.abierta ? '' : ' tienda--cerrada'}">
      <div class="perfil-tienda__portada tienda__imagen">
        ${portada}
        ${t.abierta ? '' : '<span class="tienda__estado">Cerrada ahora</span>'}
      </div>
      <div class="perfil-tienda__cabecera">
        <div class="perfil-tienda__logo tienda__logo">${logo}</div>
        <div class="perfil-tienda__texto">
          <p class="perfil-tienda__categoria">${esc(t.categorias?.nombre ?? 'Emprendimiento')}</p>
          <h1 class="perfil-tienda__nombre">${esc(t.nombre)}</h1>
          <div class="perfil-tienda__fila">${calificacion}</div>
          ${t.descripcion ? `<p class="perfil-tienda__descripcion">${esc(t.descripcion)}</p>` : ''}
          <ul class="perfil-tienda__datos">${datos.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
        </div>
        ${esDuenio() ? '' : `
          <button class="boton boton--suave perfil-tienda__chat" type="button" id="escribir">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>
            Escribir al vendedor
          </button>`}
        ${esDuenio() ? '' : '<button class="perfil-tienda__reportar" type="button" id="reportar">Reportar este emprendimiento</button>'}
      </div>
    </section>

    <div class="tienda-layout">
      <div>
        <section aria-labelledby="tituloProductos">
          <h2 class="seccion__titulo" id="tituloProductos">Productos</h2>
          <div class="productos" id="productos"></div>
        </section>

        <section class="resenas" id="resenas" aria-labelledby="tituloResenas">
          <h2 class="seccion__titulo" id="tituloResenas">Reseñas</h2>
          <div id="listaResenas"></div>
        </section>
      </div>

      <aside class="carrito" id="carrito" aria-labelledby="tituloCarrito"></aside>
    </div>`;

  pintarProductos();
  pintarResenas();
  pintarCarrito();
  animarEntrada(document.getElementById('productos'));
  animarEntrada(document.getElementById('listaResenas'));

  document.getElementById('escribir')?.addEventListener('click', escribirAlVendedor);
  document.getElementById('reportar')?.addEventListener('click', reportar);
}

// ---------------------------------------------------------
// Productos
// ---------------------------------------------------------
function pintarProductos() {
  const $p = document.getElementById('productos');
  if (!$p) return;

  if (estado.productos.length === 0) {
    $p.innerHTML = `
      <div class="vacio" style="grid-column:1/-1">
        <h3>Este emprendimiento aún no ha publicado productos</h3>
        <p>Vuelve pronto o escríbele al vendedor para preguntar qué tiene.</p>
      </div>`;
    return;
  }

  const sePuedePedir = puedePedir().ok;

  $p.innerHTML = estado.productos.map((p) => {
    const cant = estado.carrito[p.id] || 0;
    const hay  = disponible(p);
    const [fondo] = colorDe(p.nombre);

    const imagen = p.imagen_url
      ? `<img src="${esc(p.imagen_url)}" alt="" loading="lazy">`
      : `<div class="producto__sin-foto" style="background:${fondo}" aria-hidden="true">${esc(estado.tienda.categorias?.icono ?? '🛍️')}</div>`;

    let control;
    if (!hay) {
      control = '<span class="producto__agotado">Agotado</span>';
    } else if (!sePuedePedir) {
      control = '';
    } else if (cant === 0) {
      control = `<button class="boton boton--principal producto__agregar" type="button" data-sumar="${p.id}"
                   aria-label="Agregar ${esc(p.nombre)}">Agregar</button>`;
    } else {
      control = `
        <div class="contador" role="group" aria-label="Cantidad de ${esc(p.nombre)}">
          <button type="button" data-restar="${p.id}" aria-label="Quitar uno">−</button>
          <span aria-live="polite">${cant}</span>
          <button type="button" data-sumar="${p.id}" aria-label="Agregar uno">+</button>
        </div>`;
    }

    const quedan = hay && p.stock !== null && p.stock <= 5
      ? `<span class="producto__quedan">Quedan ${p.stock}</span>` : '';

    return `
      <article class="producto${hay ? '' : ' producto--agotado'}">
        <div class="producto__texto">
          <h3 class="producto__nombre">${esc(p.nombre)}</h3>
          ${p.descripcion ? `<p class="producto__descripcion">${esc(p.descripcion)}</p>` : ''}
          <p class="producto__precio">${pesos(p.precio)} ${quedan}</p>
        </div>
        <div class="producto__lado">
          <div class="producto__imagen">${imagen}</div>
          ${control}
        </div>
      </article>`;
  }).join('');
}

document.addEventListener('click', (e) => {
  const sumar  = e.target.closest('[data-sumar]');
  const restar = e.target.closest('[data-restar]');
  if (sumar)  cambiarCantidad(sumar.dataset.sumar, +1);
  if (restar) cambiarCantidad(restar.dataset.restar, -1);
});

// ---------------------------------------------------------
// Reseñas
// ---------------------------------------------------------
function pintarResenas() {
  const $r = document.getElementById('listaResenas');
  if (estado.resenas.length === 0) {
    $r.innerHTML = '<p class="resenas__vacio">Todavía no hay reseñas. Las reseñas aparecen cuando los clientes reciben sus pedidos.</p>';
    return;
  }
  const fecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });
  $r.innerHTML = estado.resenas.map((r) => `
    <article class="resena">
      <div class="resena__cabecera">
        <span class="avatar">${esc(iniciales(r.perfiles?.nombre))}</span>
        <div>
          <strong>${esc(r.perfiles?.nombre ?? 'Cliente')}</strong>
          <span class="resena__fecha">${fecha.format(new Date(r.created_at))}</span>
        </div>
        <span class="resena__estrellas" aria-label="${r.calificacion} de 5 estrellas">
          ${Array.from({ length: 5 }, (_, i) =>
            `<span class="${i < r.calificacion ? 'llena' : ''}">${ICONO_ESTRELLA}</span>`).join('')}
        </span>
      </div>
      ${r.comentario ? `<p>${esc(r.comentario)}</p>` : ''}
      ${r.respuesta ? `<p class="resena__respuesta"><strong>Respuesta de ${esc(estado.tienda.nombre)}:</strong> ${esc(r.respuesta)}</p>` : ''}
    </article>`).join('');
}

// ---------------------------------------------------------
// Carrito y formulario del pedido
// ---------------------------------------------------------
function puedePedir() {
  const t = estado.tienda;
  if (t.estado !== 'aprobada') return { ok: false, motivo: 'Esta tienda aún no recibe pedidos.' };
  if (esDuenio()) return { ok: false, motivo: 'No puedes hacer pedidos en tu propia tienda.' };
  if (!t.abierta) return { ok: false, motivo: 'La tienda está cerrada en este momento. Vuelve más tarde o escríbele al vendedor.' };
  return { ok: true };
}

function totales(tipoEntrega) {
  const subtotal = lineas().reduce((s, l) => s + l.p.precio * l.cantidad, 0);
  const domicilio = tipoEntrega === 'domicilio' ? Number(estado.tienda.costo_domicilio) : 0;
  return { subtotal, domicilio, total: subtotal + domicilio };
}

function datosGuardados() {
  try { return JSON.parse(localStorage.getItem('parchu_entrega')) || {}; } catch { return {}; }
}

function pintarCarrito() {
  const $c = document.getElementById('carrito');
  if (!$c) return;
  const t = estado.tienda;
  const ls = lineas();
  const cantidad = ls.reduce((s, l) => s + l.cantidad, 0);
  const regla = puedePedir();

  // Guardar lo que el usuario ya escribió antes de volver a pintar
  const previo = leerFormulario();

  const cabecera = `
    <div class="carrito__cabecera">
      <h2 id="tituloCarrito">Tu pedido</h2>
      <button class="carrito__cerrar" type="button" data-cerrar-carrito aria-label="Cerrar">✕</button>
    </div>`;

  if (!regla.ok) {
    $c.innerHTML = `${cabecera}<p class="carrito__vacio">${esc(regla.motivo)}</p>`;
    actualizarBarra(0, 0);
    return;
  }

  if (ls.length === 0) {
    $c.innerHTML = `${cabecera}<p class="carrito__vacio">Agrega productos para armar tu pedido.</p>`;
    actualizarBarra(0, 0);
    cerrarCarrito();
    return;
  }

  const opcionesEntrega = [];
  if (t.hace_domicilio) opcionesEntrega.push(['domicilio', `Domicilio${t.costo_domicilio > 0 ? ` (${pesos(t.costo_domicilio)})` : ' gratis'}`]);
  if (t.permite_recoger) opcionesEntrega.push(['recoger', 'Recoger en la tienda']);

  const guardado = datosGuardados();
  const tipo = previo.tipo && opcionesEntrega.some(([v]) => v === previo.tipo) ? previo.tipo : opcionesEntrega[0]?.[0];
  const metodo = previo.metodo ?? 'efectivo';
  const direccion = previo.direccion ?? guardado.direccion ?? '';
  const barrio = previo.barrio ?? guardado.barrio ?? estado.perfil?.barrio ?? '';
  const notas = previo.notas ?? '';
  const { subtotal, domicilio, total } = totales(tipo);

  const zonas = t.zonas_entrega ?? [];
  const campoBarrio = zonas.length
    ? `<select id="pedBarrio" required>
         <option value="">Elige tu barrio</option>
         ${zonas.map((z) => `<option ${z === barrio ? 'selected' : ''}>${esc(z)}</option>`).join('')}
       </select>
       <span class="campo__ayuda">Esta tienda solo entrega en estos barrios.</span>`
    : `<input id="pedBarrio" type="text" value="${esc(barrio)}" autocomplete="address-level3">`;

  let botonEnviar;
  if (!estado.perfil) {
    const volver = encodeURIComponent(`tienda.html?slug=${t.slug}`);
    botonEnviar = `<a class="boton boton--principal boton--ancho" href="login.html?volver=${volver}">Inicia sesión para pedir</a>`;
  } else {
    botonEnviar = `<button class="boton boton--principal boton--ancho" type="submit" ${estado.enviando ? 'disabled' : ''}>
        ${estado.enviando ? 'Enviando pedido…' : `Hacer pedido por ${pesos(total)}`}
      </button>`;
  }

  $c.innerHTML = `
    ${cabecera}
    <ul class="carrito__lineas">
      ${ls.map(({ p, cantidad: n }) => `
        <li class="linea">
          <div class="contador contador--chico" role="group" aria-label="Cantidad de ${esc(p.nombre)}">
            <button type="button" data-restar="${p.id}" aria-label="Quitar uno">−</button>
            <span>${n}</span>
            <button type="button" data-sumar="${p.id}" aria-label="Agregar uno">+</button>
          </div>
          <span class="linea__nombre">${esc(p.nombre)}</span>
          <span class="linea__precio">${pesos(p.precio * n)}</span>
        </li>`).join('')}
    </ul>

    <form class="carrito__formulario" id="formPedido" novalidate>
      <fieldset class="campo">
        <legend>Entrega</legend>
        <div class="opciones">
          ${opcionesEntrega.map(([v, texto]) => `
            <label class="opcion">
              <input type="radio" name="tipo" value="${v}" ${v === tipo ? 'checked' : ''}>
              <span>${texto}</span>
            </label>`).join('')}
        </div>
      </fieldset>

      <div class="${tipo === 'domicilio' ? '' : 'oculto'}" id="camposDomicilio">
        <div class="campo">
          <label for="pedDireccion">Dirección</label>
          <input id="pedDireccion" type="text" value="${esc(direccion)}" placeholder="Calle 30 # 5-20, casa azul" autocomplete="street-address">
        </div>
        <div class="campo" style="margin-top:12px">
          <label for="pedBarrio">Barrio</label>
          ${campoBarrio}
        </div>
      </div>
      ${tipo === 'recoger' && t.direccion ? `<p class="campo__ayuda">Recoges en: ${esc(t.direccion)}${t.barrio ? `, ${esc(t.barrio)}` : ''}</p>` : ''}

      <fieldset class="campo">
        <legend>Pago</legend>
        <div class="opciones opciones--pago">
          ${METODOS.map(([v, texto]) => `
            <label class="opcion">
              <input type="radio" name="metodo" value="${v}" ${v === metodo ? 'checked' : ''}>
              <span>${texto}</span>
            </label>`).join('')}
        </div>
        <span class="campo__ayuda">${metodo === 'efectivo'
          ? 'Pagas al recibir tu pedido.'
          : 'Coordina el pago con el vendedor por el chat. El pago dentro de ParchU llegará pronto.'}</span>
      </fieldset>

      <div class="campo">
        <label for="pedNotas">Notas para el vendedor <span class="campo__ayuda">(opcional)</span></label>
        <textarea id="pedNotas" rows="2" placeholder="Sin azúcar, timbre dañado, llamar al llegar…">${esc(notas)}</textarea>
      </div>

      <dl class="carrito__totales">
        <div><dt>Productos</dt><dd>${pesos(subtotal)}</dd></div>
        ${tipo === 'domicilio' ? `<div><dt>Domicilio</dt><dd>${domicilio > 0 ? pesos(domicilio) : 'Gratis'}</dd></div>` : ''}
        <div class="carrito__total"><dt>Total</dt><dd>${pesos(total)}</dd></div>
      </dl>

      <div class="alerta alerta--error oculto" id="errorPedido" role="alert"></div>
      ${botonEnviar}
    </form>`;

  actualizarBarra(cantidad, total);

  const form = document.getElementById('formPedido');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'tipo' || e.target.name === 'metodo') pintarCarrito();
  });
  form.addEventListener('submit', enviarPedido);
}

function leerFormulario() {
  const form = document.getElementById('formPedido');
  if (!form) return {};
  return {
    tipo:      form.querySelector('[name="tipo"]:checked')?.value,
    metodo:    form.querySelector('[name="metodo"]:checked')?.value,
    direccion: document.getElementById('pedDireccion')?.value,
    barrio:    document.getElementById('pedBarrio')?.value,
    notas:     document.getElementById('pedNotas')?.value,
  };
}

async function enviarPedido(e) {
  e.preventDefault();
  if (estado.enviando) return;

  const f = leerFormulario();
  const $error = document.getElementById('errorPedido');
  const mostrarError = (texto) => {
    $error.textContent = texto;
    $error.classList.remove('oculto');
  };

  if (f.tipo === 'domicilio') {
    if (!f.direccion?.trim()) return mostrarError('Escribe la dirección de entrega.');
    if ((estado.tienda.zonas_entrega ?? []).length && !f.barrio) return mostrarError('Elige tu barrio.');
  }

  estado.enviando = true;
  pintarCarrito();

  const items = lineas().map(({ p, cantidad }) => ({ producto_id: p.id, cantidad }));
  const { data: pedido, error } = await supabase.rpc('crear_pedido', {
    p_tienda: estado.tienda.id,
    p_items: items,
    p_metodo_pago: f.metodo,
    p_tipo_entrega: f.tipo,
    p_direccion: f.tipo === 'domicilio' ? f.direccion.trim() : null,
    p_barrio: f.tipo === 'domicilio' ? (f.barrio?.trim() || null) : null,
    p_notas: f.notas?.trim() || null,
  });

  estado.enviando = false;

  if (error) {
    pintarCarrito();
    document.getElementById('errorPedido').textContent = traducirError(error);
    document.getElementById('errorPedido').classList.remove('oculto');
    // Los precios o el stock pudieron cambiar: recargar productos
    recargarProductos();
    return;
  }

  // Recordar la dirección para el próximo pedido
  if (f.tipo === 'domicilio') {
    try { localStorage.setItem('parchu_entrega', JSON.stringify({ direccion: f.direccion, barrio: f.barrio })); } catch { /* nada */ }
  }

  estado.carrito = {};
  guardarCarrito();
  cerrarCarrito();
  await recargarProductos();

  document.getElementById('listoCodigo').textContent = pedido.codigo;
  $modal.querySelector('a[href^="mis-pedidos"]').href = `mis-pedidos.html?pedido=${pedido.codigo}`;
  document.getElementById('listoTexto').textContent =
    `${estado.tienda.nombre} recibió tu pedido por ${pesos(pedido.total)}. ` +
    'Te avisaremos cuando lo acepte. Si lleva más de 40 minutos de retraso, podrás cancelarlo.';
  $modal.showModal();
}

async function recargarProductos() {
  const { data } = await supabase.from('productos').select('*')
    .eq('tienda_id', estado.tienda.id).order('orden').order('created_at');
  if (data) {
    estado.productos = data;
    leerCarrito();
    pintarProductos();
    pintarCarrito();
  }
}

// ---------------------------------------------------------
// Carrito en celular (panel que sube desde abajo)
// ---------------------------------------------------------
function actualizarBarra(cantidad, total) {
  document.getElementById('barraCantidad').textContent = cantidad;
  document.getElementById('barraTotal').textContent = cantidad ? pesos(total) : '';
  $barra.classList.toggle('oculto', cantidad === 0);
  document.body.classList.toggle('con-barra', cantidad > 0);
}

function abrirCarrito() {
  document.getElementById('carrito')?.classList.add('carrito--abierto');
  document.body.classList.add('sin-scroll');
}
function cerrarCarrito() {
  document.getElementById('carrito')?.classList.remove('carrito--abierto');
  document.body.classList.remove('sin-scroll');
}
$barra.addEventListener('click', abrirCarrito);
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-cerrar-carrito]')) cerrarCarrito();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarCarrito(); });

document.getElementById('cerrarListo').addEventListener('click', () => $modal.close());

// ---------------------------------------------------------
// Chat con el vendedor
// ---------------------------------------------------------
async function escribirAlVendedor() {
  if (!estado.perfil) {
    location.href = `login.html?volver=${encodeURIComponent(`tienda.html?slug=${estado.tienda.slug}`)}`;
    return;
  }
  const { data, error } = await supabase.rpc('abrir_conversacion', { p_tienda: estado.tienda.id });
  if (error) return avisar(traducirError(error), 'error');
  location.href = `mensajes.html?c=${data.id}`;
}

// ---------------------------------------------------------
// Reportar a administración
// ---------------------------------------------------------
async function reportar() {
  if (!estado.perfil) {
    location.href = `login.html?volver=${encodeURIComponent(`tienda.html?slug=${estado.tienda.slug}`)}`;
    return;
  }
  const motivo = await preguntar({
    titulo: `Reportar ${estado.tienda.nombre}`,
    texto: 'Administración revisará tu reporte. El vendedor no sabrá quién lo envió.',
    boton: 'Enviar reporte',
    pedirTexto: { etiqueta: '¿Qué pasó?', ejemplo: 'Vende productos prohibidos, no entregó mi pedido…' },
  });
  if (motivo === null) return;
  if (!motivo) return avisar('Cuéntanos qué pasó para poder revisarlo', 'error');
  const { error } = await supabase.from('reportes')
    .insert({ reportante_id: estado.perfil.id, tienda_id: estado.tienda.id, motivo });
  if (error) return avisar(traducirError(error), 'error');
  avisar('Reporte enviado. Gracias por avisarnos.');
}

// ---------------------------------------------------------
// Errores
// ---------------------------------------------------------
function pintarNoEncontrada() {
  $contenido.innerHTML = `
    <div class="vacio" style="margin:48px 0">
      <h3>No encontramos este emprendimiento</h3>
      <p>Puede que el enlace esté mal escrito o que la tienda ya no esté publicada.</p>
      <a class="boton boton--principal" href="index.html">Ver emprendimientos</a>
    </div>`;
}

function pintarError(error) {
  console.error(error);
  $contenido.innerHTML = `
    <div class="vacio" style="margin:48px 0">
      <h3>No se pudo cargar la tienda</h3>
      <p>${esc(traducirError(error))}</p>
      <button class="boton boton--principal" type="button" onclick="location.reload()">Intentar de nuevo</button>
    </div>`;
}

pintarEncabezado();
cargar();
