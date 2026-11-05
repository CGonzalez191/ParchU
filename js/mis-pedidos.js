// Pedidos del comprador: estado en vivo, cancelar y calificar.
import { supabase } from './supabase.js';
import { pintarEncabezado, exigirSesion } from './sesion.js';
import { esc, pesos, iniciales, colorDe, avisar, traducirError, parametro, ICONO_ESTRELLA, animarEntrada, transicion, nombreVT } from './util.js';
import { ESTADO_PEDIDO, METODO_PAGO, PASOS_PEDIDO, insignia, fechaCorta, hora, preguntar } from './comun.js';

const $lista = document.getElementById('lista');
const $modal = document.getElementById('modalCalificar');

const estado = {
  perfil: null,
  pedidos: [],
  calificados: {},      // pedido_id → calificación
  minutosRetraso: 40,
  calificando: null,
  estrellas: 0,
};

async function iniciar() {
  estado.perfil = await exigirSesion();
  if (!estado.perfil) return;
  pintarEncabezado();

  const { data: cfg } = await supabase.from('configuracion').select('minutos_retraso_cancelar').maybeSingle();
  if (cfg) estado.minutosRetraso = cfg.minutos_retraso_cancelar;

  await cargar();
  escuchar();
  setInterval(pintar, 30000);   // refrescar los minutos
}

let pintadoUnaVez = false;
async function cargar() {
  const [pedidos, resenas] = await Promise.all([
    supabase.from('pedidos')
      .select('*, tiendas ( nombre, slug, logo_url, telefono, direccion, barrio ), pedido_items ( nombre_producto, cantidad, subtotal )')
      .eq('comprador_id', estado.perfil.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('resenas').select('pedido_id, calificacion').eq('comprador_id', estado.perfil.id),
  ]);

  if (pedidos.error) {
    $lista.innerHTML = `<div class="vacio"><h3>No se pudieron cargar tus pedidos</h3><p>${esc(traducirError(pedidos.error))}</p></div>`;
    return;
  }
  estado.pedidos = pedidos.data;
  estado.calificados = Object.fromEntries((resenas.data ?? []).map((r) => [r.pedido_id, r.calificacion]));
  // La primera vez entran en cascada; después (pedido aceptado, en camino…) se deslizan
  if (pintadoUnaVez) await transicion(pintar, { tipo: 'lista' });
  else { pintar(); animarEntrada($lista); pintadoUnaVez = true; }

  const destacado = parametro('pedido');
  if (destacado) document.getElementById(`pedido-${destacado}`)?.scrollIntoView({ block: 'start' });
}

// ---------------------------------------------------------
// Reglas de cancelación (las mismas de la base de datos)
// ---------------------------------------------------------
function momentoCancelable(p) {
  if (p.estado === 'pendiente') return new Date(0);
  if (!['aceptado', 'en_camino'].includes(p.estado) || !p.entrega_estimada_en) return null;
  return new Date(new Date(p.entrega_estimada_en).getTime() + estado.minutosRetraso * 60000);
}

// ---------------------------------------------------------
// Pintar
// ---------------------------------------------------------
function pintar() {
  if (estado.pedidos.length === 0) {
    $lista.innerHTML = `
      <div class="vacio">
        <h3>Todavía no has hecho pedidos</h3>
        <p>Explora los emprendimientos de Montería y pide lo que se te antoje.</p>
        <a class="boton boton--principal" href="index.html">Explorar emprendimientos</a>
      </div>`;
    return;
  }
  const activos = estado.pedidos.filter((p) => ['pendiente', 'aceptado', 'en_camino'].includes(p.estado));
  const otros   = estado.pedidos.filter((p) => !activos.includes(p));

  $lista.innerHTML = `
    ${activos.length ? `<h2 class="subtitulo con-vt" style="--vt-nombre: sub-curso">En curso</h2>${activos.map(tarjeta).join('')}` : ''}
    ${otros.length ? `<h2 class="subtitulo con-vt" style="--vt-nombre: sub-anteriores">Anteriores</h2>${otros.map(tarjeta).join('')}` : ''}`;
}

function linea(p) {
  if (p.estado === 'cancelado') return '';
  const actual = PASOS_PEDIDO.indexOf(p.estado);
  const pasos = p.tipo_entrega === 'recoger'
    ? [['pendiente', 'Enviado'], ['aceptado', 'Preparando'], ['entregado', 'Recogido']]
    : [['pendiente', 'Enviado'], ['aceptado', 'Preparando'], ['en_camino', 'En camino'], ['entregado', 'Entregado']];
  return `
    <ol class="progreso" aria-label="Estado del pedido">
      ${pasos.map(([clave, texto]) => {
        const i = PASOS_PEDIDO.indexOf(clave);
        const clase = i < actual ? 'hecho' : i === actual ? 'actual' : '';
        return `<li class="progreso__paso ${clase}"${i === actual ? ' aria-current="step"' : ''}><span>${texto}</span></li>`;
      }).join('')}
    </ol>`;
}

function tarjeta(p) {
  const t = p.tiendas ?? {};
  const e = ESTADO_PEDIDO[p.estado];
  const [, tinta] = colorDe(t.nombre);
  const logo = t.logo_url ? `<img src="${esc(t.logo_url)}" alt="">` : `<span style="color:${tinta}">${esc(iniciales(t.nombre))}</span>`;

  // Mensaje según el estado
  let detalle = '';
  if (p.estado === 'pendiente') detalle = 'Esperando que el vendedor acepte tu pedido.';
  if (['aceptado', 'en_camino'].includes(p.estado) && p.entrega_estimada_en) {
    const min = Math.round((new Date(p.entrega_estimada_en) - Date.now()) / 60000);
    detalle = min > 0
      ? `Llega aproximadamente a las ${hora(p.entrega_estimada_en)} (en ${min} min).`
      : `Debía llegar a las ${hora(p.entrega_estimada_en)} y lleva ${-min} min de retraso.`;
  }
  if (p.estado === 'entregado') detalle = `Entregado ${fechaCorta(p.entregado_en)}`;
  if (p.estado === 'cancelado') detalle = `Cancelado ${fechaCorta(p.cancelado_en)}${p.motivo_cancelacion ? ` (motivo: ${p.motivo_cancelacion})` : ''}`;

  // Cancelar
  let cancelar = '';
  const desde = momentoCancelable(p);
  if (desde) {
    if (Date.now() >= desde.getTime()) {
      cancelar = `<button class="boton boton--suave boton--texto-peligro" data-cancelar="${p.id}">Cancelar pedido</button>`;
    } else {
      cancelar = `<span class="pedido__nota">Si no llega, podrás cancelarlo desde las ${hora(desde)}</span>`;
    }
  }

  // Calificar
  let calificar = '';
  if (p.estado === 'entregado') {
    calificar = estado.calificados[p.id]
      ? `<span class="pedido__nota calificado">${ICONO_ESTRELLA} Calificaste con ${estado.calificados[p.id]}</span>`
      : `<button class="boton boton--mango" data-calificar="${p.id}">Calificar</button>`;
  }

  const reembolso = p.estado === 'cancelado' && p.metodo_pago !== 'efectivo'
    ? '<p class="alerta alerta--ok">Si ya habías pagado por transferencia, el dinero se te devuelve completo.</p>' : '';

  return `
    <article class="pedido con-vt" id="pedido-${esc(p.codigo)}" ${nombreVT('pedido', p.id)}>
      <header class="pedido__cabecera">
        <a class="pedido__tienda" href="tienda.html?slug=${encodeURIComponent(t.slug ?? '')}">
          <span class="tienda__logo">${logo}</span>
          <span><strong>${esc(t.nombre ?? 'Tienda')}</strong><small>#${esc(p.codigo)}, ${fechaCorta(p.created_at)}</small></span>
        </a>
        ${insignia(e.texto, e.clase)}
      </header>

      ${linea(p)}
      <p class="pedido__estado">${esc(detalle)}</p>
      ${reembolso}

      <div class="pedido__cuerpo">
        <ul class="pedido__items">
          ${p.pedido_items.map((i) => `<li><span>${i.cantidad} × ${esc(i.nombre_producto)}</span><span>${pesos(i.subtotal)}</span></li>`).join('')}
          ${p.costo_domicilio > 0 ? `<li class="pedido__extra"><span>Domicilio</span><span>${pesos(p.costo_domicilio)}</span></li>` : ''}
        </ul>
        <dl class="pedido__datos">
          <div><dt>Entrega</dt><dd>${p.tipo_entrega === 'domicilio'
            ? `${esc(p.direccion_entrega ?? '')}${p.barrio_entrega ? `, ${esc(p.barrio_entrega)}` : ''}`
            : `Recoges en ${esc(t.direccion ?? 'la tienda')}${t.barrio ? `, ${esc(t.barrio)}` : ''}`}</dd></div>
          <div><dt>Pago</dt><dd>${METODO_PAGO[p.metodo_pago]}</dd></div>
        </dl>
      </div>

      <footer class="pedido__pie">
        <div class="pedido__total"><span>Total ${pesos(p.total)}</span></div>
        <div class="pedido__acciones">
          ${cancelar}
          <button class="boton boton--suave" data-chat="${p.tienda_id}">Escribir a la tienda</button>
          ${calificar}
        </div>
      </footer>
    </article>`;
}

// ---------------------------------------------------------
// Acciones
// ---------------------------------------------------------
$lista.addEventListener('click', async (e) => {
  const cancelar = e.target.closest('[data-cancelar]');
  const chat = e.target.closest('[data-chat]');
  const calificar = e.target.closest('[data-calificar]');

  if (cancelar) {
    const p = estado.pedidos.find((x) => x.id === cancelar.dataset.cancelar);
    const motivo = await preguntar({
      titulo: 'Cancelar pedido',
      texto: p.estado === 'pendiente'
        ? 'El vendedor todavía no lo ha aceptado, así que puedes cancelarlo sin problema.'
        : `Tu pedido lleva más de ${estado.minutosRetraso} minutos de retraso. Si pagaste por transferencia, se te devuelve el dinero.`,
      boton: 'Cancelar pedido',
      peligro: true,
      pedirTexto: { etiqueta: 'Motivo (opcional)', ejemplo: 'No llegó a tiempo' },
    });
    if (motivo === null) return;
    const { error } = await supabase.rpc('cancelar_pedido', { p_pedido: p.id, p_motivo: motivo || null });
    if (error) return avisar(traducirError(error), 'error');
    avisar('Pedido cancelado');
    cargar();
  }

  if (chat) {
    chat.disabled = true;
    const { data, error } = await supabase.rpc('abrir_conversacion', { p_tienda: chat.dataset.chat });
    chat.disabled = false;
    if (error) return avisar(traducirError(error), 'error');
    location.href = `mensajes.html?c=${data.id}`;
  }

  if (calificar) abrirCalificar(estado.pedidos.find((x) => x.id === calificar.dataset.calificar));
});

// ---------------------------------------------------------
// Calificar
// ---------------------------------------------------------
const $estrellas = document.getElementById('estrellas');

function pintarEstrellas() {
  const textos = ['', 'Muy mal', 'Mal', 'Regular', 'Bien', 'Excelente'];
  $estrellas.innerHTML = [1, 2, 3, 4, 5].map((n) => `
    <label class="estrella${n <= estado.estrellas ? ' llena' : ''}">
      <input type="radio" name="estrellas" value="${n}" class="solo-lector" ${n === estado.estrellas ? 'checked' : ''}>
      ${ICONO_ESTRELLA.replace('width="14" height="14"', 'width="38" height="38"')}
      <span class="solo-lector">${n} ${n === 1 ? 'estrella' : 'estrellas'}, ${textos[n]}</span>
    </label>`).join('') +
    `<span class="estrellas__texto">${textos[estado.estrellas] ?? ''}</span>`;
}

$estrellas.addEventListener('change', (e) => {
  estado.estrellas = Number(e.target.value);
  pintarEstrellas();
  $estrellas.querySelector(`input[value="${estado.estrellas}"]`).focus();
});

function abrirCalificar(p) {
  estado.calificando = p;
  estado.estrellas = 0;
  document.getElementById('textoCalificar').textContent = `Pedido #${p.codigo} de ${p.tiendas?.nombre ?? 'la tienda'}`;
  document.getElementById('comentario').value = '';
  document.getElementById('errorCalificar').classList.add('oculto');
  pintarEstrellas();
  $modal.showModal();
}

$modal.querySelector('[data-cerrar]').addEventListener('click', () => $modal.close());

document.getElementById('formCalificar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const $err = document.getElementById('errorCalificar');
  if (!estado.estrellas) {
    $err.textContent = 'Elige cuántas estrellas le das.';
    return $err.classList.remove('oculto');
  }
  const boton = e.target.querySelector('button[type="submit"]');
  boton.disabled = true;
  const { error } = await supabase.rpc('crear_resena', {
    p_pedido: estado.calificando.id,
    p_calificacion: estado.estrellas,
    p_comentario: document.getElementById('comentario').value.trim() || null,
  });
  boton.disabled = false;
  if (error) {
    $err.textContent = traducirError(error);
    return $err.classList.remove('oculto');
  }
  $modal.close();
  avisar('¡Gracias por tu reseña!');
  cargar();
});

// ---------------------------------------------------------
// Tiempo real: el vendedor cambia el estado
// ---------------------------------------------------------
function escuchar() {
  supabase
    .channel(`pedidos-comprador-${estado.perfil.id}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `comprador_id=eq.${estado.perfil.id}` },
      (cambio) => {
        const antes = estado.pedidos.find((p) => p.id === cambio.new.id);
        if (antes && antes.estado !== cambio.new.estado) {
          const textos = {
            aceptado: `${antes.tiendas?.nombre ?? 'La tienda'} aceptó tu pedido`,
            en_camino: 'Tu pedido va en camino',
            entregado: 'Tu pedido fue entregado',
            cancelado: 'Tu pedido fue cancelado',
          };
          if (textos[cambio.new.estado]) avisar(textos[cambio.new.estado], cambio.new.estado === 'cancelado' ? 'error' : 'ok');
        }
        cargar();
      })
    .subscribe();
}

iniciar();
