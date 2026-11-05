// Panel del vendedor: abrir tienda, pedidos, productos, datos y reseñas.
import { supabase } from './supabase.js';
import { pintarEncabezado, exigirSesion, obtenerPerfil } from './sesion.js';
import { esc, pesos, iniciales, colorDe, avisar, traducirError, ICONO_ESTRELLA, animarEntrada, transicion, nombreVT } from './util.js';
import {
  ESTADO_PEDIDO, ESTADO_TIENDA, METODO_PAGO, insignia, fechaCorta, hace,
  subirImagen, vistaPrevia, preguntar, activarPestanas, crearSlug,
} from './comun.js';

const $ = (id) => document.getElementById(id);

const estado = {
  perfil: null,
  categorias: [],
  tienda: null,
  pedidos: [],
  productos: [],
  resenas: [],
  conversaciones: {},       // comprador_id → conversación
  filtro: 'activos',
  editando: null,           // producto en edición
  canal: null,
};

// =========================================================
// Inicio
// =========================================================
async function iniciar() {
  estado.perfil = await exigirSesion();
  if (!estado.perfil) return;
  pintarEncabezado();

  const [cats, tienda] = await Promise.all([
    supabase.from('categorias').select('id, nombre, icono').order('orden'),
    supabase.from('tiendas').select('*').eq('propietario_id', estado.perfil.id).maybeSingle(),
  ]);
  estado.categorias = cats.data ?? [];
  $('cargando').remove();

  if (tienda.error) return avisar(traducirError(tienda.error), 'error');

  if (!tienda.data) {
    $('sinTienda').classList.remove('oculto');
    pintarFormularioTienda($('formCrear'), null);
    return;
  }

  estado.tienda = tienda.data;
  $('conTienda').classList.remove('oculto');
  activarPestanas(document.querySelector('.pestanas-panel'));
  pintarCabecera();
  pintarFormularioTienda($('formEditar'), estado.tienda);
  await Promise.all([cargarPedidos(), cargarProductos(), cargarResenas()]);
  escucharPedidos();
}

// =========================================================
// Formulario de la tienda (crear y editar)
// =========================================================
function pintarFormularioTienda(form, t) {
  const v = (campo, porDefecto = '') => esc(t?.[campo] ?? porDefecto);
  const fotoLogo    = t?.logo_url    ? `<img src="${esc(t.logo_url)}" alt="">`    : '<span>Logo</span>';
  const fotoPortada = t?.portada_url ? `<img src="${esc(t.portada_url)}" alt="">` : '<span>Foto de portada</span>';

  form.innerHTML = `
    <div class="alerta alerta--error oculto" data-mensaje role="alert"></div>

    <fieldset class="bloque">
      <legend>Tu emprendimiento</legend>
      <div class="fotos-tienda">
        <label class="subir-foto subir-foto--portada" for="tPortada">
          <span class="subir-foto__vista" data-vista="portada">${fotoPortada}</span>
          <input id="tPortada" name="portada" type="file" accept="image/jpeg,image/png,image/webp" class="solo-lector">
        </label>
        <label class="subir-foto subir-foto--logo" for="tLogo">
          <span class="subir-foto__vista" data-vista="logo">${fotoLogo}</span>
          <input id="tLogo" name="logo" type="file" accept="image/jpeg,image/png,image/webp" class="solo-lector">
        </label>
      </div>
      <div class="rejilla-2">
        <div class="campo">
          <label for="tNombre">Nombre de la tienda</label>
          <input id="tNombre" name="nombre" type="text" maxlength="60" required value="${v('nombre')}" placeholder="Dulce Tentación">
        </div>
        <div class="campo">
          <label for="tCategoria">Categoría</label>
          <select id="tCategoria" name="categoria" required>
            <option value="">Elige una</option>
            ${estado.categorias.map((c) =>
              `<option value="${c.id}" ${t?.categoria_id === c.id ? 'selected' : ''}>${esc(c.icono ?? '')} ${esc(c.nombre)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="campo">
        <label for="tDescripcion">Descripción</label>
        <textarea id="tDescripcion" name="descripcion" rows="3" maxlength="400" placeholder="Cuéntales a tus clientes qué vendes y qué te hace especial.">${v('descripcion')}</textarea>
      </div>
    </fieldset>

    <fieldset class="bloque">
      <legend>Contacto y ubicación</legend>
      <div class="rejilla-2">
        <div class="campo">
          <label for="tTelefono">Celular de la tienda</label>
          <input id="tTelefono" name="telefono" type="tel" inputmode="numeric" value="${v('telefono', estado.perfil.telefono ?? '')}" placeholder="300 123 4567">
        </div>
        <div class="campo">
          <label for="tHorario">Horario</label>
          <input id="tHorario" name="horario" type="text" value="${v('horario')}" placeholder="Lun a Sáb, 9 a. m. a 7 p. m.">
        </div>
        <div class="campo">
          <label for="tDireccion">Dirección</label>
          <input id="tDireccion" name="direccion" type="text" value="${v('direccion')}" placeholder="Cra 6 # 61-12">
          <span class="campo__ayuda">Se muestra solo a quien elige recoger su pedido.</span>
        </div>
        <div class="campo">
          <label for="tBarrio">Barrio</label>
          <input id="tBarrio" name="barrio" type="text" value="${v('barrio')}" placeholder="La Castellana">
        </div>
      </div>
    </fieldset>

    <fieldset class="bloque">
      <legend>Entregas</legend>
      <label class="interruptor">
        <input name="hace_domicilio" type="checkbox" ${t ? (t.hace_domicilio ? 'checked' : '') : 'checked'}>
        <span class="interruptor__pista" aria-hidden="true"></span>
        <span>Hago domicilios</span>
      </label>
      <div class="rejilla-2" data-domicilio>
        <div class="campo">
          <label for="tCosto">Costo del domicilio (pesos)</label>
          <input id="tCosto" name="costo_domicilio" type="number" min="0" step="500" inputmode="numeric" value="${v('costo_domicilio', 3000)}">
          <span class="campo__ayuda">Pon 0 si el domicilio es gratis.</span>
        </div>
        <div class="campo">
          <label for="tTiempo">Tiempo de entrega (minutos)</label>
          <input id="tTiempo" name="tiempo_entrega_min" type="number" min="5" step="5" inputmode="numeric" value="${v('tiempo_entrega_min', 30)}">
          <span class="campo__ayuda">Si te pasas 40 minutos de este tiempo, el cliente puede cancelar.</span>
        </div>
      </div>
      <div class="campo" data-domicilio>
        <label for="tZonas">Barrios a los que entregas</label>
        <input id="tZonas" name="zonas" type="text" value="${esc((t?.zonas_entrega ?? []).join(', '))}" placeholder="La Castellana, El Recreo, Centro">
        <span class="campo__ayuda">Sepáralos con comas. Déjalo vacío si entregas en toda la ciudad.</span>
      </div>
      <label class="interruptor">
        <input name="permite_recoger" type="checkbox" ${t?.permite_recoger ? 'checked' : ''}>
        <span class="interruptor__pista" aria-hidden="true"></span>
        <span>Los clientes pueden recoger en mi tienda</span>
      </label>
    </fieldset>

    <div class="formulario-tienda__pie">
      <button class="boton boton--principal" type="submit">${t ? 'Guardar cambios' : 'Enviar a revisión'}</button>
    </div>`;

  vistaPrevia(form.logo, form.querySelector('[data-vista="logo"]'));
  vistaPrevia(form.portada, form.querySelector('[data-vista="portada"]'));

  const domicilio = form.hace_domicilio;
  const ajustar = () => form.querySelectorAll('[data-domicilio]')
    .forEach((el) => el.classList.toggle('apagado', !domicilio.checked));
  domicilio.addEventListener('change', ajustar);
  ajustar();

  form.onsubmit = (e) => guardarTienda(e, form);
}

async function guardarTienda(e, form) {
  e.preventDefault();
  const $msg = form.querySelector('[data-mensaje]');
  const error = (texto) => {
    $msg.textContent = texto;
    $msg.classList.remove('oculto');
    $msg.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  $msg.classList.add('oculto');

  const nombre = form.nombre.value.trim();
  if (!nombre) return error('Escribe el nombre de tu tienda.');
  if (!form.categoria.value) return error('Elige una categoría.');
  if (!form.hace_domicilio.checked && !form.permite_recoger.checked) {
    return error('Activa domicilios, recoger en tienda o ambos, para que los clientes puedan recibir sus pedidos.');
  }

  const boton = form.querySelector('button[type="submit"]');
  const textoBoton = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    const datos = {
      nombre,
      categoria_id: Number(form.categoria.value),
      descripcion: form.descripcion.value.trim() || null,
      telefono: form.telefono.value.replace(/\D/g, '') || null,
      horario: form.horario.value.trim() || null,
      direccion: form.direccion.value.trim() || null,
      barrio: form.barrio.value.trim() || null,
      hace_domicilio: form.hace_domicilio.checked,
      permite_recoger: form.permite_recoger.checked,
      costo_domicilio: Math.max(0, Number(form.costo_domicilio.value) || 0),
      tiempo_entrega_min: Math.max(5, Number(form.tiempo_entrega_min.value) || 30),
      zonas_entrega: form.zonas.value.split(',').map((z) => z.trim()).filter(Boolean),
    };

    if (form.logo.files[0])    datos.logo_url    = await subirImagen(form.logo.files[0], estado.perfil.id);
    if (form.portada.files[0]) datos.portada_url = await subirImagen(form.portada.files[0], estado.perfil.id);

    if (estado.tienda) {
      const { data, error: err } = await supabase.from('tiendas')
        .update(datos).eq('id', estado.tienda.id).select().single();
      if (err) throw err;
      estado.tienda = data;
      pintarCabecera();
      pintarFormularioTienda($('formEditar'), data);
      avisar('Cambios guardados');
    } else {
      const { error: err } = await supabase.from('tiendas')
        .insert({ ...datos, propietario_id: estado.perfil.id, slug: crearSlug(nombre) });
      if (err) throw err;
      // Ahora es vendedor: recargar la página con su tienda
      await obtenerPerfil({ recargar: true });
      location.reload();
    }
  } catch (err) {
    error(traducirError(err));
  } finally {
    boton.disabled = false;
    boton.textContent = textoBoton;
  }
}

// =========================================================
// Cabecera, estado de la tienda y abrir/cerrar
// =========================================================
function pintarCabecera() {
  const t = estado.tienda;
  const [, tinta] = colorDe(t.nombre);
  const logo = t.logo_url ? `<img src="${esc(t.logo_url)}" alt="">` : `<span style="color:${tinta}">${esc(iniciales(t.nombre))}</span>`;
  const e = ESTADO_TIENDA[t.estado];

  $('cabecera').innerHTML = `
    <div class="tienda__logo panel__logo">${logo}</div>
    <div class="panel__titulo">
      <h1>${esc(t.nombre)}</h1>
      <div class="panel__fila">
        ${insignia(e.texto, e.clase)}
        ${t.estado === 'aprobada' ? `<a href="tienda.html?slug=${encodeURIComponent(t.slug)}">Ver como cliente</a>` : ''}
      </div>
    </div>
    <label class="interruptor interruptor--grande" title="Abre o cierra tu tienda para recibir pedidos">
      <input type="checkbox" id="abierta" ${t.abierta ? 'checked' : ''}>
      <span class="interruptor__pista" aria-hidden="true"></span>
      <span id="textoAbierta">${t.abierta ? 'Recibiendo pedidos' : 'Tienda cerrada'}</span>
    </label>`;

  $('abierta').addEventListener('change', async (ev) => {
    const abierta = ev.target.checked;
    const { error } = await supabase.from('tiendas').update({ abierta }).eq('id', t.id);
    if (error) {
      ev.target.checked = !abierta;
      return avisar(traducirError(error), 'error');
    }
    estado.tienda.abierta = abierta;
    $('textoAbierta').textContent = abierta ? 'Recibiendo pedidos' : 'Tienda cerrada';
    avisar(abierta ? 'Tu tienda está abierta' : 'Tu tienda está cerrada');
  });

  const avisos = {
    pendiente: ['mango', 'Tu tienda está en revisión. Administración la aprobará pronto; mientras tanto, sube tus productos para que esté lista.'],
    rechazada: ['error', `Tu tienda no fue aprobada.${t.motivo_rechazo ? ` Motivo: ${t.motivo_rechazo}.` : ''} Corrige los datos en "Datos de la tienda" o escríbenos.`],
    suspendida: ['error', `Tu tienda está suspendida y no aparece para los clientes.${t.motivo_rechazo ? ` Motivo: ${t.motivo_rechazo}.` : ''}`],
  };
  const aviso = avisos[t.estado];
  $('avisoEstado').innerHTML = aviso
    ? `<div class="alerta alerta--${aviso[0] === 'mango' ? 'mango' : 'error'} panel__aviso">${esc(aviso[1])}</div>` : '';
}

async function pintarEstadisticas() {
  const { data } = await supabase.from('resumen_tiendas').select('*').eq('tienda_id', estado.tienda.id).maybeSingle();
  const r = data ?? {};
  const cifras = [
    ['Pedidos en curso', r.pedidos_activos ?? 0],
    ['Pedidos entregados', r.pedidos_entregados ?? 0],
    ['Ventas', pesos(r.ventas_totales)],
    ['Tu ganancia', pesos(r.ganancia_vendedor), 'Ventas de productos menos el 8% de ParchU'],
  ];
  $('estadisticas').innerHTML = cifras.map(([etq, valor, ayuda]) => `
    <div class="cifra"${ayuda ? ` title="${esc(ayuda)}"` : ''}>
      <span class="cifra__valor">${esc(valor)}</span>
      <span class="cifra__etiqueta">${esc(etq)}</span>
    </div>`).join('');
}

// =========================================================
// Pedidos
// =========================================================
let pedidosPintados = false;
async function cargarPedidos() {
  const [{ data, error }, convs] = await Promise.all([
    supabase.from('pedidos')
      .select('*, pedido_items ( nombre_producto, cantidad, subtotal ), comprador:perfiles!pedidos_comprador_id_fkey ( nombre, telefono )')
      .eq('tienda_id', estado.tienda.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('conversaciones').select('id, comprador_id').eq('tienda_id', estado.tienda.id),
  ]);
  if (error) return avisar(traducirError(error), 'error');
  estado.pedidos = data;
  estado.conversaciones = Object.fromEntries((convs.data ?? []).map((c) => [c.comprador_id, c]));
  // La primera vez entran en cascada; después, los cambios se deslizan
  if (pedidosPintados) transicion(pintarPedidos, { tipo: 'lista' });
  else { pintarPedidos(); animarEntrada($('listaPedidos')); pedidosPintados = true; }
  pintarEstadisticas();
}

const esActivo = (p) => ['pendiente', 'aceptado', 'en_camino'].includes(p.estado);

function pintarPedidos() {
  const activos = estado.pedidos.filter(esActivo);
  const nuevos = activos.filter((p) => p.estado === 'pendiente').length;
  const cuenta = $('cuentaPedidos');
  cuenta.textContent = nuevos;
  cuenta.classList.toggle('oculto', nuevos === 0);

  const lista = estado.filtro === 'activos' ? activos : estado.pedidos.filter((p) => !esActivo(p));
  const $l = $('listaPedidos');

  if (lista.length === 0) {
    $l.innerHTML = estado.filtro === 'activos'
      ? `<div class="vacio"><h3>No tienes pedidos en curso</h3><p>${estado.tienda.abierta
          ? 'Cuando un cliente te haga un pedido aparecerá aquí al instante, con un aviso.'
          : 'Tu tienda está cerrada. Ábrela con el interruptor de arriba para empezar a recibir pedidos.'}</p></div>`
      : '<div class="vacio"><h3>Aún no hay pedidos terminados</h3><p>Aquí verás los pedidos entregados y cancelados.</p></div>';
    return;
  }

  $l.innerHTML = lista.map(tarjetaPedido).join('');
}

function tarjetaPedido(p) {
  const e = ESTADO_PEDIDO[p.estado];
  const conv = estado.conversaciones[p.comprador_id];
  const tel = p.comprador?.telefono;

  const acciones = {
    pendiente: `<button class="boton boton--principal" data-accion="aceptado" data-id="${p.id}">Aceptar pedido</button>`,
    aceptado: `
      ${p.tipo_entrega === 'domicilio'
        ? `<button class="boton boton--principal" data-accion="en_camino" data-id="${p.id}">Salió a entregar</button>`
        : ''}
      <button class="boton ${p.tipo_entrega === 'domicilio' ? 'boton--suave' : 'boton--principal'}" data-accion="entregado" data-id="${p.id}">Marcar entregado</button>`,
    en_camino: `<button class="boton boton--principal" data-accion="entregado" data-id="${p.id}">Marcar entregado</button>`,
  }[p.estado] ?? '';

  let tiempo = '';
  if (p.estado === 'pendiente') tiempo = `Llegó ${hace(p.created_at)}`;
  else if (esActivo(p) && p.entrega_estimada_en) {
    const min = Math.round((new Date(p.entrega_estimada_en) - Date.now()) / 60000);
    tiempo = min >= 0 ? `Entregar en ${min} min` : `<span class="texto-alerta">Retrasado ${-min} min</span>`;
  } else if (p.estado === 'entregado') tiempo = `Entregado ${fechaCorta(p.entregado_en)}`;
  else if (p.estado === 'cancelado') tiempo = `Cancelado ${fechaCorta(p.cancelado_en)}`;

  return `
    <article class="pedido con-vt${p.estado === 'pendiente' ? ' pedido--nuevo' : ''}" ${nombreVT('pedido', p.id)}>
      <header class="pedido__cabecera">
        <div>
          <strong class="pedido__codigo">#${esc(p.codigo)}</strong>
          ${insignia(e.corto, e.clase)}
        </div>
        <span class="pedido__tiempo">${tiempo}</span>
      </header>

      <div class="pedido__cuerpo">
        <ul class="pedido__items">
          ${p.pedido_items.map((i) => `<li><span>${i.cantidad} × ${esc(i.nombre_producto)}</span><span>${pesos(i.subtotal)}</span></li>`).join('')}
        </ul>
        <dl class="pedido__datos">
          <div><dt>Cliente</dt><dd>${esc(p.comprador?.nombre ?? 'Cliente')}${tel ? ` · <a href="tel:${esc(tel)}">${esc(tel)}</a>` : ''}</dd></div>
          <div><dt>Entrega</dt><dd>${p.tipo_entrega === 'domicilio'
            ? `${esc(p.direccion_entrega ?? '')}${p.barrio_entrega ? `, ${esc(p.barrio_entrega)}` : ''}`
            : 'Recoge en la tienda'}</dd></div>
          <div><dt>Pago</dt><dd>${METODO_PAGO[p.metodo_pago]}</dd></div>
          ${p.notas ? `<div><dt>Notas</dt><dd>${esc(p.notas)}</dd></div>` : ''}
          ${p.motivo_cancelacion ? `<div><dt>Motivo</dt><dd>${esc(p.motivo_cancelacion)}</dd></div>` : ''}
        </dl>
      </div>

      <footer class="pedido__pie">
        <div class="pedido__total">
          <span>Total ${pesos(p.total)}</span>
          <small>Comisión ParchU ${pesos(p.comision)}</small>
        </div>
        <div class="pedido__acciones">
          ${conv ? `<a class="boton boton--suave" href="mensajes.html?c=${conv.id}">Chat</a>` : ''}
          ${esActivo(p) ? `<button class="boton boton--suave boton--texto-peligro" data-cancelar="${p.id}">Cancelar</button>` : ''}
          ${acciones}
        </div>
      </footer>
    </article>`;
}

$('listaPedidos').addEventListener('click', async (e) => {
  const accion = e.target.closest('[data-accion]');
  const cancelar = e.target.closest('[data-cancelar]');

  if (accion) {
    accion.disabled = true;
    const { error } = await supabase.rpc('actualizar_estado_pedido', {
      p_pedido: accion.dataset.id, p_estado: accion.dataset.accion,
    });
    if (error) { accion.disabled = false; return avisar(traducirError(error), 'error'); }
    avisar({ aceptado: 'Pedido aceptado', en_camino: 'Pedido en camino', entregado: 'Pedido entregado' }[accion.dataset.accion]);
    cargarPedidos();
  }

  if (cancelar) {
    const motivo = await preguntar({
      titulo: 'Cancelar este pedido',
      texto: 'El cliente verá el pedido como cancelado y el motivo que escribas.',
      boton: 'Cancelar pedido',
      peligro: true,
      pedirTexto: { etiqueta: 'Motivo', ejemplo: 'Se nos acabaron las galletas de avena' },
    });
    if (motivo === null) return;
    const { error } = await supabase.rpc('cancelar_pedido', { p_pedido: cancelar.dataset.cancelar, p_motivo: motivo || null });
    if (error) return avisar(traducirError(error), 'error');
    avisar('Pedido cancelado');
    cargarPedidos();
  }
});

document.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
  estado.filtro = b.dataset.filtro;
  document.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  transicion(pintarPedidos, { tipo: 'lista' });
}));

// Pedidos nuevos en tiempo real
function escucharPedidos() {
  estado.canal = supabase
    .channel(`pedidos-tienda-${estado.tienda.id}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos', filter: `tienda_id=eq.${estado.tienda.id}` },
      (cambio) => {
        if (cambio.eventType === 'INSERT') {
          avisar('¡Nuevo pedido!');
          sonar();
        }
        if (cambio.eventType === 'UPDATE' && cambio.new.estado === 'cancelado' && cambio.old?.estado !== 'cancelado') {
          avisar(`El pedido #${cambio.new.codigo} fue cancelado`, 'error');
        }
        // Esperar un instante para que los productos del pedido ya estén guardados
        setTimeout(cargarPedidos, 600);
      })
    .subscribe();

  // Actualizar los minutos restantes cada medio minuto
  setInterval(() => { if (estado.filtro === 'activos') pintarPedidos(); }, 30000);
}

function sonar() {
  try {
    const ctx = new AudioContext();
    [0, 0.18].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.16);
    });
  } catch { /* sin sonido */ }
}

// =========================================================
// Productos
// =========================================================
let productosPintados = false;
async function cargarProductos() {
  const { data, error } = await supabase.from('productos').select('*')
    .eq('tienda_id', estado.tienda.id).order('orden').order('created_at');
  if (error) return avisar(traducirError(error), 'error');
  estado.productos = data;
  if (productosPintados) transicion(pintarProductos, { tipo: 'lista' });
  else { pintarProductos(); animarEntrada($('listaProductos')); productosPintados = true; }
}

function pintarProductos() {
  const n = estado.productos.length;
  $('notaProductos').textContent = n
    ? `${n} ${n === 1 ? 'producto' : 'productos'}, ${estado.productos.filter((p) => p.disponible).length} a la venta`
    : '';

  if (n === 0) {
    $('listaProductos').innerHTML = `
      <div class="vacio">
        <h3>Sube tu primer producto</h3>
        <p>Con foto, precio y una buena descripción vendes más.</p>
      </div>`;
    return;
  }

  $('listaProductos').innerHTML = estado.productos.map((p) => {
    const [fondo] = colorDe(p.nombre);
    const foto = p.imagen_url
      ? `<img src="${esc(p.imagen_url)}" alt="">`
      : `<span style="background:${fondo}">${esc(iniciales(p.nombre))}</span>`;
    let stock = 'Sin control de unidades';
    if (p.stock !== null) stock = p.stock === 0 ? '<span class="texto-alerta">Agotado</span>' : `${p.stock} disponibles`;

    return `
      <article class="fila-producto con-vt${p.disponible ? '' : ' fila-producto--oculto'}" ${nombreVT('producto', p.id)}>
        <div class="fila-producto__foto">${foto}</div>
        <div class="fila-producto__texto">
          <strong>${esc(p.nombre)}</strong>
          <span>${pesos(p.precio)}</span>
          <small>${stock}</small>
        </div>
        <label class="interruptor" title="Mostrar u ocultar en tu tienda">
          <input type="checkbox" data-disponible="${p.id}" ${p.disponible ? 'checked' : ''}>
          <span class="interruptor__pista" aria-hidden="true"></span>
          <span class="solo-lector">Disponible</span>
        </label>
        <div class="fila-producto__acciones">
          <button class="boton boton--suave" type="button" data-editar="${p.id}">Editar</button>
          <button class="boton boton--suave boton--texto-peligro" type="button" data-borrar="${p.id}" aria-label="Eliminar ${esc(p.nombre)}">Eliminar</button>
        </div>
      </article>`;
  }).join('');
}

$('listaProductos').addEventListener('click', async (e) => {
  const editar = e.target.closest('[data-editar]');
  const borrar = e.target.closest('[data-borrar]');
  if (editar) abrirProducto(estado.productos.find((p) => p.id === editar.dataset.editar));
  if (borrar) {
    const p = estado.productos.find((x) => x.id === borrar.dataset.borrar);
    const ok = await preguntar({
      titulo: `Eliminar "${p.nombre}"`,
      texto: 'Desaparecerá de tu tienda. Los pedidos anteriores conservan su información. Si solo quieres ocultarlo por un tiempo, usa el interruptor.',
      boton: 'Eliminar', peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('productos').delete().eq('id', p.id);
    if (error) return avisar(traducirError(error), 'error');
    avisar('Producto eliminado');
    cargarProductos();
  }
});

$('listaProductos').addEventListener('change', async (e) => {
  const sw = e.target.closest('[data-disponible]');
  if (!sw) return;
  const { error } = await supabase.from('productos').update({ disponible: sw.checked }).eq('id', sw.dataset.disponible);
  if (error) { sw.checked = !sw.checked; return avisar(traducirError(error), 'error'); }
  const p = estado.productos.find((x) => x.id === sw.dataset.disponible);
  p.disponible = sw.checked;
  pintarProductos();
});

const $modalProd = $('modalProducto');
const $formProd = $('formProducto');
vistaPrevia($('prodFoto'), $('prodVista'));

function abrirProducto(p = null) {
  estado.editando = p;
  $formProd.reset();
  $formProd.querySelector('[data-mensaje]').classList.add('oculto');
  $('tituloProducto').textContent = p ? 'Editar producto' : 'Nuevo producto';
  $('prodNombre').value = p?.nombre ?? '';
  $('prodPrecio').value = p?.precio ?? '';
  $('prodDescripcion').value = p?.descripcion ?? '';
  $('prodStock').value = p?.stock ?? '';
  $('prodDisponible').checked = p ? p.disponible : true;
  $('prodVista').innerHTML = p?.imagen_url ? `<img src="${esc(p.imagen_url)}" alt="">` : '<span>Agregar foto</span>';
  $modalProd.showModal();
  $('prodNombre').focus();
}

$('nuevoProducto').addEventListener('click', () => abrirProducto());
$modalProd.querySelector('[data-cerrar]').addEventListener('click', () => $modalProd.close());

$formProd.addEventListener('submit', async (e) => {
  e.preventDefault();
  const $msg = $formProd.querySelector('[data-mensaje]');
  const error = (t) => { $msg.textContent = t; $msg.classList.remove('oculto'); };

  const nombre = $('prodNombre').value.trim();
  const precio = Number($('prodPrecio').value);
  const stockTxt = $('prodStock').value.trim();
  if (!nombre) return error('Escribe el nombre del producto.');
  if (!$('prodPrecio').value || precio < 0) return error('Escribe un precio válido.');
  if (stockTxt && (!Number.isInteger(Number(stockTxt)) || Number(stockTxt) < 0)) return error('Las unidades deben ser un número entero.');

  const boton = $formProd.querySelector('button[type="submit"]');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    const datos = {
      nombre,
      precio: Math.round(precio),
      descripcion: $('prodDescripcion').value.trim() || null,
      stock: stockTxt === '' ? null : Number(stockTxt),
      disponible: $('prodDisponible').checked,
    };
    const foto = $('prodFoto').files[0];
    if (foto) datos.imagen_url = await subirImagen(foto, estado.perfil.id);

    const consulta = estado.editando
      ? supabase.from('productos').update(datos).eq('id', estado.editando.id)
      : supabase.from('productos').insert({ ...datos, tienda_id: estado.tienda.id, orden: estado.productos.length });
    const { error: err } = await consulta;
    if (err) throw err;

    $modalProd.close();
    avisar(estado.editando ? 'Producto actualizado' : 'Producto agregado');
    cargarProductos();
  } catch (err) {
    error(traducirError(err));
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar producto';
  }
});

// =========================================================
// Reseñas
// =========================================================
async function cargarResenas() {
  const { data } = await supabase.from('resenas')
    .select('*, perfiles ( nombre )')
    .eq('tienda_id', estado.tienda.id)
    .order('created_at', { ascending: false });
  estado.resenas = data ?? [];
  pintarResenas();
}

function pintarResenas() {
  const $r = $('listaResenas');
  if (estado.resenas.length === 0) {
    $r.innerHTML = '<div class="vacio"><h3>Aún no tienes reseñas</h3><p>Los clientes pueden calificarte cuando reciben su pedido.</p></div>';
    return;
  }
  const t = estado.tienda;
  $r.innerHTML = `
    <p class="panel__nota resumen-resenas">${ICONO_ESTRELLA} <strong>${Number(t.calificacion_promedio).toFixed(1)}</strong> de 5 con ${t.total_resenas} ${t.total_resenas === 1 ? 'reseña' : 'reseñas'}</p>
    ${estado.resenas.map((r) => `
      <article class="resena">
        <div class="resena__cabecera">
          <span class="avatar">${esc(iniciales(r.perfiles?.nombre))}</span>
          <div><strong>${esc(r.perfiles?.nombre ?? 'Cliente')}</strong><span class="resena__fecha">${fechaCorta(r.created_at)}</span></div>
          <span class="resena__estrellas" aria-label="${r.calificacion} de 5">${Array.from({ length: 5 }, (_, i) =>
            `<span class="${i < r.calificacion ? 'llena' : ''}">${ICONO_ESTRELLA}</span>`).join('')}</span>
        </div>
        ${r.comentario ? `<p>${esc(r.comentario)}</p>` : ''}
        <form class="responder" data-resena="${r.id}">
          <label class="solo-lector" for="resp-${r.id}">Tu respuesta</label>
          <textarea id="resp-${r.id}" rows="2" placeholder="Responde públicamente a ${esc(r.perfiles?.nombre ?? 'este cliente')}">${esc(r.respuesta ?? '')}</textarea>
          <button class="boton boton--suave" type="submit">${r.respuesta ? 'Actualizar respuesta' : 'Responder'}</button>
        </form>
      </article>`).join('')}`;
}

$('listaResenas').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target.closest('[data-resena]');
  const respuesta = form.querySelector('textarea').value.trim() || null;
  const { error } = await supabase.from('resenas').update({ respuesta }).eq('id', form.dataset.resena);
  if (error) return avisar(traducirError(error), 'error');
  avisar('Respuesta publicada');
  cargarResenas();
});

iniciar();
