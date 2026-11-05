// Chat en tiempo real entre compradores y tiendas.
import { supabase } from './supabase.js';
import { pintarEncabezado, exigirSesion } from './sesion.js';
import { esc, iniciales, colorDe, avisar, traducirError, parametro, animarEntrada, transicion } from './util.js';
import { hora, hace } from './comun.js';

const $chat  = document.getElementById('chat');
const $lista = document.getElementById('conversaciones');
const $conv  = document.getElementById('conversacion');

const estado = {
  perfil: null,
  conversaciones: [],
  noLeidos: {},       // conversacion_id → cantidad
  actual: null,       // conversación abierta
  mensajes: [],
};

// Mensajes ya mostrados en la conversación abierta: solo los nuevos se animan
const pintados = { conversacion: null, ids: new Set() };

async function iniciar() {
  estado.perfil = await exigirSesion();
  if (!estado.perfil) return;
  pintarEncabezado();
  await cargarConversaciones();
  escuchar();

  const pedida = parametro('c');
  if (pedida) abrir(pedida);
}

// ---------------------------------------------------------
// Lista de conversaciones
// ---------------------------------------------------------
async function cargarConversaciones() {
  const yo = estado.perfil.id;
  const [convs, sinLeer] = await Promise.all([
    supabase.from('conversaciones')
      .select('id, comprador_id, tienda_id, ultimo_mensaje, ultimo_mensaje_en, tiendas ( nombre, slug, logo_url, propietario_id ), comprador:perfiles!conversaciones_comprador_id_fkey ( nombre, avatar_url )')
      .order('ultimo_mensaje_en', { ascending: false }),
    supabase.from('mensajes').select('conversacion_id').eq('leido', false).neq('remitente_id', yo),
  ]);

  if (convs.error) {
    $lista.innerHTML = `<li class="conversaciones__vacio">${esc(traducirError(convs.error))}</li>`;
    return;
  }

  // El vendedor no ve conversaciones que el cliente abrió pero nunca escribió
  estado.conversaciones = convs.data.filter((c) => c.comprador_id === yo || c.ultimo_mensaje);
  estado.noLeidos = {};
  for (const m of sinLeer.data ?? []) estado.noLeidos[m.conversacion_id] = (estado.noLeidos[m.conversacion_id] ?? 0) + 1;
  pintarLista();
  animarEntrada($lista);
}

/** Con quién hablo en esta conversación. */
function otraParte(c) {
  const soyComprador = c.comprador_id === estado.perfil.id;
  return soyComprador
    ? { nombre: c.tiendas?.nombre ?? 'Tienda', detalle: 'Tienda', foto: c.tiendas?.logo_url, enlace: `tienda.html?slug=${encodeURIComponent(c.tiendas?.slug ?? '')}` }
    : { nombre: c.comprador?.nombre ?? 'Cliente', detalle: `Cliente de ${c.tiendas?.nombre ?? 'tu tienda'}`, foto: c.comprador?.avatar_url, enlace: null };
}

function fotoDe(parte) {
  if (parte.foto) return `<span class="avatar"><img src="${esc(parte.foto)}" alt=""></span>`;
  const [fondo, tinta] = colorDe(parte.nombre);
  return `<span class="avatar" style="background:${fondo};color:${tinta}">${esc(iniciales(parte.nombre))}</span>`;
}

function pintarLista() {
  if (estado.conversaciones.length === 0) {
    $lista.innerHTML = `
      <li class="conversaciones__vacio">
        No tienes conversaciones todavía. Entra a una tienda y toca <strong>Escribir al vendedor</strong>.
      </li>`;
    return;
  }
  $lista.innerHTML = estado.conversaciones.map((c) => {
    const parte = otraParte(c);
    const n = estado.noLeidos[c.id] ?? 0;
    const activa = estado.actual?.id === c.id;
    return `
      <li>
        <button class="conversacion${activa ? ' conversacion--activa' : ''}${n ? ' conversacion--nueva' : ''}" type="button" data-abrir="${c.id}"
                ${activa ? 'aria-current="true"' : ''}>
          ${fotoDe(parte)}
          <span class="conversacion__texto">
            <span class="conversacion__fila">
              <strong>${esc(parte.nombre)}</strong>
              <small>${c.ultimo_mensaje ? hace(c.ultimo_mensaje_en) : ''}</small>
            </span>
            <span class="conversacion__fila">
              <span class="conversacion__ultimo">${esc(c.ultimo_mensaje ?? 'Escribe el primer mensaje')}</span>
              ${n ? `<span class="burbuja-cuenta" aria-label="${n} sin leer">${n}</span>` : ''}
            </span>
          </span>
        </button>
      </li>`;
  }).join('');
}

$lista.addEventListener('click', (e) => {
  const b = e.target.closest('[data-abrir]');
  if (b) abrir(b.dataset.abrir);
});

// ---------------------------------------------------------
// Conversación abierta
// ---------------------------------------------------------
async function abrir(id) {
  const c = estado.conversaciones.find((x) => x.id === id);
  if (!c) return avisar('No encontramos esa conversación', 'error');

  estado.actual = c;
  estado.mensajes = [];
  history.replaceState(null, '', `mensajes.html?c=${id}`);

  const parte = otraParte(c);
  // En celular la conversación entra deslizándose desde la derecha
  await transicion(() => {
    $chat.classList.add('chat--abierto');
    $conv.innerHTML = `
    <header class="chat__cabecera">
      <button class="chat__volver" type="button" data-volver aria-label="Volver a la lista">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      ${fotoDe(parte)}
      <div>
        <strong>${parte.enlace ? `<a href="${parte.enlace}">${esc(parte.nombre)}</a>` : esc(parte.nombre)}</strong>
        <small>${esc(parte.detalle)}</small>
      </div>
    </header>
    <div class="chat__mensajes" id="mensajes"><p class="cargando">Cargando mensajes…</p></div>
    <form class="chat__escribir" id="formMensaje" autocomplete="off">
      <label class="solo-lector" for="texto">Escribe un mensaje</label>
      <textarea id="texto" rows="1" maxlength="1000" placeholder="Escribe un mensaje"></textarea>
      <button class="boton boton--principal" type="submit" aria-label="Enviar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </form>`;
    pintarLista();
  }, { tipo: 'chat' });

  const { data, error } = await supabase.from('mensajes')
    .select('*').eq('conversacion_id', id)
    .order('created_at', { ascending: true }).limit(300);
  if (error) return avisar(traducirError(error), 'error');
  estado.mensajes = data;
  pintarMensajes();
  marcarLeidos();

  const $texto = document.getElementById('texto');
  $texto.focus();
  $texto.addEventListener('input', () => {
    $texto.style.height = 'auto';
    $texto.style.height = `${Math.min($texto.scrollHeight, 140)}px`;
  });
  // Enter envía, Shift+Enter hace salto de línea
  $texto.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('formMensaje').requestSubmit();
    }
  });
  document.getElementById('formMensaje').addEventListener('submit', enviar);
}

function pintarMensajes() {
  const $m = document.getElementById('mensajes');
  if (!$m) return;
  if (estado.mensajes.length === 0) {
    $m.innerHTML = '<p class="chat__inicio">Saluda y pregunta lo que necesites: disponibilidad, encargos, pagos o entregas.</p>';
    return;
  }
  const dia = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  let ultimoDia = '';
  // Al abrir otra conversación, lo que ya hay se muestra sin animar
  const primeraVez = pintados.conversacion !== estado.actual?.id;
  if (primeraVez) pintados.conversacion = estado.actual?.id;
  $m.innerHTML = estado.mensajes.map((m) => {
    const d = dia.format(new Date(m.created_at));
    const separador = d !== ultimoDia ? `<p class="chat__dia">${d}</p>` : '';
    ultimoDia = d;
    const mio = m.remitente_id === estado.perfil.id;
    // El mensaje real que reemplaza al temporal no se vuelve a animar
    const nuevo = !primeraVez && !pintados.ids.has(m.id) && !(mio && !m.pendiente && pintados.ids.has(`tmp:${m.contenido}`));
    return `${separador}
      <div class="mensaje${mio ? ' mensaje--mio' : ''}${m.pendiente ? ' mensaje--enviando' : ''}${nuevo ? ' mensaje--nuevo' : ''}">
        <p>${esc(m.contenido)}</p>
        <small>${hora(m.created_at)}${mio && m.leido ? ' · Visto' : ''}</small>
      </div>`;
  }).join('');
  pintados.ids = new Set(estado.mensajes.flatMap((m) => (m.pendiente ? [m.id, `tmp:${m.contenido}`] : [m.id])));
  $m.scrollTop = $m.scrollHeight;
}

async function enviar(e) {
  e.preventDefault();
  const $texto = document.getElementById('texto');
  const contenido = $texto.value.trim();
  if (!contenido || !estado.actual) return;

  // Mostrar de una vez mientras se guarda
  const temporal = {
    id: `tmp-${Date.now()}`, contenido, remitente_id: estado.perfil.id,
    created_at: new Date().toISOString(), pendiente: true,
  };
  estado.mensajes.push(temporal);
  pintarMensajes();
  $texto.value = '';
  $texto.style.height = 'auto';

  const { data, error } = await supabase.from('mensajes')
    .insert({ conversacion_id: estado.actual.id, remitente_id: estado.perfil.id, contenido })
    .select().single();

  const i = estado.mensajes.indexOf(temporal);
  if (error) {
    estado.mensajes.splice(i, 1);
    pintarMensajes();
    $texto.value = contenido;
    return avisar(traducirError(error), 'error');
  }
  // Puede que el tiempo real ya lo haya agregado
  if (estado.mensajes.some((m) => m.id === data.id)) estado.mensajes.splice(i, 1);
  else estado.mensajes[i] = data;
  pintarMensajes();
  moverArriba(estado.actual.id, contenido, data.created_at);
}

async function marcarLeidos() {
  if (!estado.actual) return;
  if (estado.noLeidos[estado.actual.id]) {
    delete estado.noLeidos[estado.actual.id];
    pintarLista();
  }
  await supabase.rpc('marcar_leidos', { p_conv: estado.actual.id });
}

function moverArriba(convId, texto, fecha) {
  const c = estado.conversaciones.find((x) => x.id === convId);
  if (!c) return;
  c.ultimo_mensaje = texto.slice(0, 120);
  c.ultimo_mensaje_en = fecha;
  estado.conversaciones.sort((a, b) => new Date(b.ultimo_mensaje_en) - new Date(a.ultimo_mensaje_en));
  pintarLista();
}

$conv.addEventListener('click', (e) => {
  if (e.target.closest('[data-volver]')) {
    estado.actual = null;
    history.replaceState(null, '', 'mensajes.html');
    transicion(() => {
      $chat.classList.remove('chat--abierto');
      pintarLista();
    }, { tipo: 'chat', direccion: 'atras' });
  }
});

// ---------------------------------------------------------
// Tiempo real
// ---------------------------------------------------------
function escuchar() {
  supabase
    .channel(`mensajes-${estado.perfil.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, async (cambio) => {
      const m = cambio.new;
      const conocida = estado.conversaciones.some((c) => c.id === m.conversacion_id);
      if (!conocida) {
        await cargarConversaciones();
        return;
      }
      moverArriba(m.conversacion_id, m.contenido, m.created_at);

      if (estado.actual?.id === m.conversacion_id) {
        if (!estado.mensajes.some((x) => x.id === m.id)) {
          // Reemplazar el temporal si es mío
          const tmp = estado.mensajes.findIndex((x) => x.pendiente && x.contenido === m.contenido && m.remitente_id === estado.perfil.id);
          if (tmp >= 0) estado.mensajes[tmp] = m;
          else estado.mensajes.push(m);
          pintarMensajes();
        }
        if (m.remitente_id !== estado.perfil.id) marcarLeidos();
      } else if (m.remitente_id !== estado.perfil.id) {
        estado.noLeidos[m.conversacion_id] = (estado.noLeidos[m.conversacion_id] ?? 0) + 1;
        pintarLista();
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes' }, (cambio) => {
      // "Visto"
      const m = estado.mensajes.find((x) => x.id === cambio.new.id);
      if (m && m.leido !== cambio.new.leido) {
        m.leido = cambio.new.leido;
        pintarMensajes();
      }
    })
    .subscribe();
}

iniciar();
