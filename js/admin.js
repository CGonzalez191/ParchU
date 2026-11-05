// Panel de administración.
import { supabase } from './supabase.js';
import { pintarEncabezado, exigirSesion } from './sesion.js';
import { esc, pesos, iniciales, colorDe, avisar, traducirError, ICONO_ESTRELLA, animarEntrada, transicion, nombreVT } from './util.js';
import {
  ESTADO_PEDIDO, ESTADO_TIENDA, METODO_PAGO, insignia, fechaCorta, hace, preguntar, activarPestanas,
} from './comun.js';

const $ = (id) => document.getElementById(id);

const estado = {
  tiendas: [],
  productosPorTienda: {},
  resumen: {},          // tienda_id → cifras
  pedidos: [],
  reportes: [],
  usuarios: 0,
  filtroTiendas: 'todas',
};

async function iniciar() {
  const perfil = await exigirSesion(['admin']);
  if (!perfil) return;
  pintarEncabezado();
  activarPestanas(document.querySelector('.pestanas-panel'));
  await cargarTodo();

  // Avisar cuando llega una solicitud o un pedido nuevo
  supabase.channel('admin')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tiendas' }, () => {
      avisar('Nueva solicitud de tienda');
      cargarTodo();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => cargarTodo())
    .subscribe();
}

let todoPintado = false;
async function cargarTodo() {
  const [tiendas, productos, resumen, pedidos, reportes, usuarios, config] = await Promise.all([
    supabase.from('tiendas')
      .select('*, categorias ( nombre, icono ), propietario:perfiles!tiendas_propietario_id_fkey ( nombre, telefono )')
      .order('created_at', { ascending: false }),
    supabase.from('productos').select('tienda_id, nombre'),
    supabase.from('resumen_tiendas').select('*'),
    supabase.from('pedidos')
      .select('id, codigo, estado, total, comision, metodo_pago, tipo_entrega, created_at, tiendas ( nombre, slug ), comprador:perfiles!pedidos_comprador_id_fkey ( nombre )')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('reportes')
      .select('*, reportante:perfiles!reportes_reportante_id_fkey ( nombre ), tiendas ( id, nombre, slug, estado ), productos ( nombre )')
      .order('created_at', { ascending: false }),
    supabase.from('perfiles').select('id', { count: 'exact', head: true }),
    supabase.from('configuracion').select('*').maybeSingle(),
  ]);

  const error = [tiendas, productos, resumen, pedidos, reportes].find((r) => r.error)?.error;
  if (error) return avisar(traducirError(error), 'error');

  estado.tiendas = tiendas.data;
  estado.productosPorTienda = {};
  for (const p of productos.data) (estado.productosPorTienda[p.tienda_id] ??= []).push(p.nombre);
  estado.resumen = Object.fromEntries(resumen.data.map((r) => [r.tienda_id, r]));
  estado.pedidos = pedidos.data;
  estado.reportes = reportes.data;
  estado.usuarios = usuarios.count ?? 0;

  if (config.data) {
    $('comision').value = config.data.comision_porcentaje;
    $('retraso').value = config.data.minutos_retraso_cancelar;
  }

  const pintarTodo = () => {
    pintarEstadisticas();
    pintarSolicitudes();
    pintarFiltroTiendas();
    pintarTiendas();
    pintarPedidos();
    pintarReportes();
  };
  // La primera vez entran en cascada; después (aprobar, resolver…) se deslizan
  if (todoPintado) return transicion(pintarTodo, { tipo: 'lista' });
  pintarTodo();
  ['estadisticas', 'listaSolicitudes', 'listaReportes'].forEach((id) => animarEntrada(document.getElementById(id)));
  todoPintado = true;
}

// ---------------------------------------------------------
// Cifras generales
// ---------------------------------------------------------
function pintarEstadisticas() {
  const r = Object.values(estado.resumen);
  const suma = (campo) => r.reduce((s, x) => s + Number(x[campo] ?? 0), 0);
  const cifras = [
    ['Usuarios', estado.usuarios],
    ['Tiendas activas', estado.tiendas.filter((t) => t.estado === 'aprobada').length],
    ['Pedidos entregados', suma('pedidos_entregados')],
    ['Ventas en ParchU', pesos(suma('ventas_totales'))],
    ['Comisiones', pesos(suma('comisiones_parchu'))],
  ];
  $('estadisticas').innerHTML = cifras.map(([etq, valor]) => `
    <div class="cifra"><span class="cifra__valor">${esc(valor)}</span><span class="cifra__etiqueta">${esc(etq)}</span></div>`).join('');
}

// ---------------------------------------------------------
// Solicitudes (tiendas en revisión)
// ---------------------------------------------------------
function pintarSolicitudes() {
  const pendientes = estado.tiendas.filter((t) => t.estado === 'pendiente')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  $('cuentaSolicitudes').textContent = pendientes.length;
  $('cuentaSolicitudes').classList.toggle('oculto', pendientes.length === 0);

  if (pendientes.length === 0) {
    $('listaSolicitudes').innerHTML = '<div class="vacio"><h3>No hay solicitudes por revisar</h3><p>Cuando alguien abra una tienda aparecerá aquí para que la apruebes.</p></div>';
    return;
  }

  $('listaSolicitudes').innerHTML = pendientes.map((t) => {
    const [fondo, tinta] = colorDe(t.nombre);
    const productos = estado.productosPorTienda[t.id] ?? [];
    const portada = t.portada_url
      ? `<img src="${esc(t.portada_url)}" alt="">`
      : `<div class="tienda__sin-foto" style="background:${fondo}" aria-hidden="true">${esc(t.categorias?.icono ?? '🛍️')}</div>`;
    const logo = t.logo_url ? `<img src="${esc(t.logo_url)}" alt="">` : `<span style="color:${tinta}">${esc(iniciales(t.nombre))}</span>`;

    return `
      <article class="solicitud con-vt" ${nombreVT('solicitud', t.id)}>
        <div class="solicitud__portada tienda__imagen">${portada}</div>
        <div class="solicitud__cuerpo">
          <div class="solicitud__cabecera">
            <span class="tienda__logo">${logo}</span>
            <div>
              <h3>${esc(t.nombre)}</h3>
              <small>${esc(t.categorias?.nombre ?? 'Sin categoría')}, enviada ${hace(t.created_at)}</small>
            </div>
          </div>
          ${t.descripcion ? `<p>${esc(t.descripcion)}</p>` : '<p class="texto-suave">Sin descripción.</p>'}
          <dl class="pedido__datos">
            <div><dt>Dueño</dt><dd>${esc(t.propietario?.nombre ?? '')}${t.propietario?.telefono || t.telefono
              ? `, <a href="tel:${esc(t.telefono ?? t.propietario.telefono)}">${esc(t.telefono ?? t.propietario.telefono)}</a>` : ''}</dd></div>
            <div><dt>Ubicación</dt><dd>${esc([t.direccion, t.barrio].filter(Boolean).join(', ') || 'No indicada')}</dd></div>
            <div><dt>Entregas</dt><dd>${[
              t.hace_domicilio ? `Domicilio ${t.costo_domicilio > 0 ? pesos(t.costo_domicilio) : 'gratis'}` : null,
              t.permite_recoger ? 'Recoger en tienda' : null,
            ].filter(Boolean).join(' y ')}</dd></div>
            <div><dt>Productos</dt><dd>${productos.length
              ? `${productos.length}: ${esc(productos.slice(0, 5).join(', '))}${productos.length > 5 ? '…' : ''}`
              : 'Aún no ha subido productos'}</dd></div>
          </dl>
          <div class="solicitud__acciones">
            <a class="boton boton--suave" href="tienda.html?slug=${encodeURIComponent(t.slug)}" target="_blank" rel="noopener">Ver tienda</a>
            <button class="boton boton--suave boton--texto-peligro" data-revisar="${t.id}" data-estado="rechazada">Rechazar</button>
            <button class="boton boton--principal" data-revisar="${t.id}" data-estado="aprobada">Aprobar</button>
          </div>
        </div>
      </article>`;
  }).join('');
}

// Aprobar, rechazar, suspender o reactivar
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-revisar]');
  if (!b) return;
  const t = estado.tiendas.find((x) => x.id === b.dataset.revisar);
  const nuevo = b.dataset.estado;

  let motivo = null;
  if (nuevo === 'rechazada' || nuevo === 'suspendida') {
    motivo = await preguntar({
      titulo: `${nuevo === 'rechazada' ? 'Rechazar' : 'Suspender'} "${t.nombre}"`,
      texto: nuevo === 'rechazada'
        ? 'El vendedor verá el motivo en su panel para que pueda corregirlo.'
        : 'La tienda dejará de aparecer para los clientes hasta que la reactives.',
      boton: nuevo === 'rechazada' ? 'Rechazar' : 'Suspender',
      peligro: true,
      pedirTexto: { etiqueta: 'Motivo', ejemplo: 'Vende productos no permitidos' },
    });
    if (motivo === null) return;
  }

  b.disabled = true;
  const { error } = await supabase.rpc('revisar_tienda', { p_tienda: t.id, p_estado: nuevo, p_motivo: motivo || null });
  if (error) { b.disabled = false; return avisar(traducirError(error), 'error'); }
  avisar({ aprobada: `${t.nombre} ya está publicada`, rechazada: 'Solicitud rechazada', suspendida: 'Tienda suspendida' }[nuevo]);
  cargarTodo();
});

// ---------------------------------------------------------
// Todas las tiendas
// ---------------------------------------------------------
function pintarFiltroTiendas() {
  const opciones = [['todas', 'Todas'], ...Object.entries(ESTADO_TIENDA).map(([k, v]) => [k, v.texto])];
  $('filtroTiendas').innerHTML = opciones.map(([k, texto]) => {
    const n = k === 'todas' ? estado.tiendas.length : estado.tiendas.filter((t) => t.estado === k).length;
    return `<button class="chip" type="button" data-filtro-tienda="${k}" aria-pressed="${estado.filtroTiendas === k}">${texto} (${n})</button>`;
  }).join('');
}

$('filtroTiendas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtro-tienda]');
  if (!b) return;
  estado.filtroTiendas = b.dataset.filtroTienda;
  pintarFiltroTiendas();
  pintarTiendas();
});

function pintarTiendas() {
  const lista = estado.tiendas.filter((t) => estado.filtroTiendas === 'todas' || t.estado === estado.filtroTiendas);
  if (lista.length === 0) {
    $('tablaTiendas').innerHTML = '<tbody><tr><td class="tabla__vacia">No hay tiendas en este estado.</td></tr></tbody>';
    return;
  }
  $('tablaTiendas').innerHTML = `
    <thead><tr>
      <th>Tienda</th><th>Dueño</th><th>Estado</th>
      <th class="num">Pedidos</th><th class="num">Ventas</th><th class="num">Comisión</th><th class="num">Calificación</th><th></th>
    </tr></thead>
    <tbody>
      ${lista.map((t) => {
        const r = estado.resumen[t.id] ?? {};
        const e = ESTADO_TIENDA[t.estado];
        const accion = {
          aprobada: `<button class="boton boton--suave boton--texto-peligro boton--chico" data-revisar="${t.id}" data-estado="suspendida">Suspender</button>`,
          suspendida: `<button class="boton boton--suave boton--chico" data-revisar="${t.id}" data-estado="aprobada">Reactivar</button>`,
          rechazada: `<button class="boton boton--suave boton--chico" data-revisar="${t.id}" data-estado="aprobada">Aprobar</button>`,
          pendiente: `<button class="boton boton--principal boton--chico" data-revisar="${t.id}" data-estado="aprobada">Aprobar</button>`,
        }[t.estado];
        return `
          <tr>
            <td><a href="tienda.html?slug=${encodeURIComponent(t.slug)}">${esc(t.nombre)}</a><small>${esc(t.categorias?.nombre ?? '')}</small></td>
            <td>${esc(t.propietario?.nombre ?? '')}<small>${esc(t.telefono ?? t.propietario?.telefono ?? '')}</small></td>
            <td>${insignia(e.texto, e.clase)}${t.motivo_rechazo ? `<small>${esc(t.motivo_rechazo)}</small>` : ''}</td>
            <td class="num">${r.pedidos_entregados ?? 0}</td>
            <td class="num">${pesos(r.ventas_totales)}</td>
            <td class="num">${pesos(r.comisiones_parchu)}</td>
            <td class="num">${t.total_resenas ? `${ICONO_ESTRELLA} ${Number(t.calificacion_promedio).toFixed(1)}` : '—'}</td>
            <td class="tabla__accion">${accion}</td>
          </tr>`;
      }).join('')}
    </tbody>`;
}

// ---------------------------------------------------------
// Pedidos
// ---------------------------------------------------------
function pintarPedidos() {
  if (estado.pedidos.length === 0) {
    $('tablaPedidos').innerHTML = '<tbody><tr><td class="tabla__vacia">Todavía no hay pedidos en ParchU.</td></tr></tbody>';
    return;
  }
  $('tablaPedidos').innerHTML = `
    <thead><tr>
      <th>Pedido</th><th>Tienda</th><th>Cliente</th><th>Estado</th><th>Pago</th>
      <th class="num">Total</th><th class="num">Comisión</th>
    </tr></thead>
    <tbody>
      ${estado.pedidos.map((p) => {
        const e = ESTADO_PEDIDO[p.estado];
        return `
          <tr>
            <td><strong>#${esc(p.codigo)}</strong><small>${fechaCorta(p.created_at)}</small></td>
            <td>${esc(p.tiendas?.nombre ?? '')}</td>
            <td>${esc(p.comprador?.nombre ?? '')}</td>
            <td>${insignia(e.corto, e.clase)}</td>
            <td>${METODO_PAGO[p.metodo_pago]}<small>${p.tipo_entrega === 'domicilio' ? 'Domicilio' : 'Recoge'}</small></td>
            <td class="num">${pesos(p.total)}</td>
            <td class="num">${p.estado === 'cancelado' ? '—' : pesos(p.comision)}</td>
          </tr>`;
      }).join('')}
    </tbody>`;
}

// ---------------------------------------------------------
// Reportes
// ---------------------------------------------------------
const ESTADO_REPORTE = {
  abierto: ['Abierto', 'mango'], en_revision: ['En revisión', 'sinu'],
  resuelto: ['Resuelto', 'gris'], descartado: ['Descartado', 'gris'],
};

function pintarReportes() {
  const abiertos = estado.reportes.filter((r) => ['abierto', 'en_revision'].includes(r.estado)).length;
  $('cuentaReportes').textContent = abiertos;
  $('cuentaReportes').classList.toggle('oculto', abiertos === 0);

  if (estado.reportes.length === 0) {
    $('listaReportes').innerHTML = '<div class="vacio"><h3>No hay reportes</h3><p>Los clientes pueden reportar una tienda desde su página. Los reportes aparecerán aquí.</p></div>';
    return;
  }

  $('listaReportes').innerHTML = estado.reportes.map((r) => {
    const [texto, clase] = ESTADO_REPORTE[r.estado];
    return `
      <article class="reporte con-vt" ${nombreVT('reporte', r.id)}>
        <div class="reporte__cabecera">
          <div>
            <strong>${r.tiendas ? `<a href="tienda.html?slug=${encodeURIComponent(r.tiendas.slug)}">${esc(r.tiendas.nombre)}</a>` : 'Tienda eliminada'}</strong>
            ${r.productos ? `<small>Producto: ${esc(r.productos.nombre)}</small>` : ''}
            <small>Reportado por ${esc(r.reportante?.nombre ?? 'un usuario')}, ${hace(r.created_at)}</small>
          </div>
          ${insignia(texto, clase)}
        </div>
        <p>${esc(r.motivo)}</p>
        <div class="reporte__acciones">
          <label class="solo-lector" for="rep-${r.id}">Estado del reporte</label>
          <select id="rep-${r.id}" data-reporte="${r.id}">
            ${Object.entries(ESTADO_REPORTE).map(([k, [t]]) => `<option value="${k}" ${k === r.estado ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          ${r.tiendas?.estado === 'aprobada'
            ? `<button class="boton boton--suave boton--texto-peligro boton--chico" data-revisar="${r.tiendas.id}" data-estado="suspendida">Suspender tienda</button>` : ''}
        </div>
      </article>`;
  }).join('');
}

$('listaReportes').addEventListener('change', async (e) => {
  const s = e.target.closest('[data-reporte]');
  if (!s) return;
  const { error } = await supabase.from('reportes').update({ estado: s.value }).eq('id', s.dataset.reporte);
  if (error) return avisar(traducirError(error), 'error');
  avisar('Reporte actualizado');
  cargarTodo();
});

// ---------------------------------------------------------
// Ajustes
// ---------------------------------------------------------
$('formAjustes').addEventListener('submit', async (e) => {
  e.preventDefault();
  const comision = Number($('comision').value);
  const retraso = Number($('retraso').value);
  if (!(comision >= 0 && comision <= 50)) return avisar('La comisión debe estar entre 0 y 50%', 'error');
  if (!(retraso >= 5)) return avisar('El tiempo debe ser de al menos 5 minutos', 'error');
  const { error } = await supabase.from('configuracion')
    .update({ comision_porcentaje: comision, minutos_retraso_cancelar: retraso }).eq('id', 1);
  if (error) return avisar(traducirError(error), 'error');
  avisar('Ajustes guardados');
});

iniciar();
