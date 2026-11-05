// Piezas compartidas por los paneles (pedidos, fechas, fotos, ventanas).
import { supabase } from './supabase.js';
import { esc, transicion } from './util.js';

// ---------------------------------------------------------
// Estados de pedido
// ---------------------------------------------------------
export const ESTADO_PEDIDO = {
  pendiente: { texto: 'Esperando al vendedor', corto: 'Nuevo',      clase: 'mango' },
  aceptado:  { texto: 'En preparación',        corto: 'Aceptado',   clase: 'sinu' },
  en_camino: { texto: 'En camino',             corto: 'En camino',  clase: 'sinu' },
  entregado: { texto: 'Entregado',             corto: 'Entregado',  clase: 'gris' },
  cancelado: { texto: 'Cancelado',             corto: 'Cancelado',  clase: 'corozo' },
};

export const ESTADO_TIENDA = {
  pendiente:  { texto: 'En revisión', clase: 'mango' },
  aprobada:   { texto: 'Aprobada',    clase: 'sinu' },
  rechazada:  { texto: 'Rechazada',   clase: 'corozo' },
  suspendida: { texto: 'Suspendida',  clase: 'corozo' },
};

export const METODO_PAGO = {
  efectivo: 'Efectivo', nequi: 'Nequi', bancolombia: 'Bancolombia', daviplata: 'Daviplata', otro: 'Otro',
};

export function insignia(texto, clase = 'gris') {
  return `<span class="insignia insignia--${clase}">${esc(texto)}</span>`;
}

export const PASOS_PEDIDO = ['pendiente', 'aceptado', 'en_camino', 'entregado'];

// ---------------------------------------------------------
// Fechas
// ---------------------------------------------------------
const fmtHora  = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
const fmtFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });

export function hora(fecha) { return fmtHora.format(new Date(fecha)); }

/** "hoy 3:20 p. m.", "ayer 9:00 a. m." o "28 oct. 3:20 p. m." */
export function fechaCorta(fecha) {
  const d = new Date(fecha);
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a, b) => a.toDateString() === b.toDateString();
  if (mismoDia(d, hoy)) return `hoy ${fmtHora.format(d)}`;
  if (mismoDia(d, ayer)) return `ayer ${fmtHora.format(d)}`;
  return `${fmtFecha.format(d)} ${fmtHora.format(d)}`;
}

/** "hace 5 min" */
export function hace(fecha) {
  const min = Math.round((Date.now() - new Date(fecha)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return fechaCorta(fecha);
}

// ---------------------------------------------------------
// Subir fotos a Supabase Storage (bucket "imagenes")
// ---------------------------------------------------------
const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

export async function subirImagen(archivo, usuarioId) {
  if (!TIPOS.includes(archivo.type)) throw new Error('La foto debe ser JPG, PNG o WEBP.');
  if (archivo.size > 5 * 1024 * 1024) throw new Error('La foto pesa más de 5 MB. Elige una más liviana.');
  const ext = archivo.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const ruta = `${usuarioId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('imagenes').upload(ruta, archivo, {
    cacheControl: '3600', upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from('imagenes').getPublicUrl(ruta).data.publicUrl;
}

/** Muestra una vista previa al elegir una foto en <input type="file">. */
export function vistaPrevia(input, contenedor) {
  input.addEventListener('change', () => {
    const archivo = input.files?.[0];
    if (!archivo) return;
    const url = URL.createObjectURL(archivo);
    contenedor.innerHTML = `<img src="${url}" alt="">`;
  });
}

// ---------------------------------------------------------
// Ventanas (confirmar / pedir un texto)
// ---------------------------------------------------------
/**
 * Abre una ventana y devuelve una promesa.
 * pedirTexto: muestra un campo de texto y devuelve lo escrito (o null si cancela).
 */
export function preguntar({ titulo, texto = '', boton = 'Confirmar', peligro = false, pedirTexto = null }) {
  return new Promise((resolver) => {
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.innerHTML = `
      <form method="dialog" class="modal__cuerpo modal__cuerpo--izq">
        <h2>${esc(titulo)}</h2>
        ${texto ? `<p>${esc(texto)}</p>` : ''}
        ${pedirTexto ? `
          <div class="campo" style="margin-top:16px">
            <label for="modalTexto">${esc(pedirTexto.etiqueta)}</label>
            <textarea id="modalTexto" rows="3" placeholder="${esc(pedirTexto.ejemplo ?? '')}"></textarea>
          </div>` : ''}
        <div class="modal__botones">
          <button class="boton boton--suave" value="no" type="submit">Volver</button>
          <button class="boton ${peligro ? 'boton--peligro' : 'boton--principal'}" value="si" type="submit">${esc(boton)}</button>
        </div>
      </form>`;
    document.body.append(d);
    d.addEventListener('close', () => {
      const ok = d.returnValue === 'si';
      const valor = pedirTexto ? d.querySelector('#modalTexto').value.trim() : true;
      d.remove();
      resolver(ok ? valor : null);
    });
    d.showModal();
    d.querySelector(pedirTexto ? 'textarea' : 'button[value="si"]').focus();
  });
}

/** Activa pestañas: botones [data-pestana="x"] muestran el panel [data-panel="x"]. */
export function activarPestanas(raiz, alCambiar) {
  const botones = [...raiz.querySelectorAll('[data-pestana]')];
  // Rayita que se desliza de una pestaña a otra
  const indicador = document.createElement('span');
  indicador.className = 'pestanas-panel__indicador';
  indicador.setAttribute('aria-hidden', 'true');
  let actual = null;

  const cambiar = (nombre) => {
    botones.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pestana === nombre)));
    botones.find((b) => b.dataset.pestana === nombre)?.append(indicador);
    document.querySelectorAll('[data-panel]').forEach((p) =>
      p.classList.toggle('oculto', p.dataset.panel !== nombre));
    history.replaceState(null, '', `#${nombre}`);
    alCambiar?.(nombre);
  };

  const mostrar = (nombre, animar = true) => {
    if (nombre === actual) return;
    const antes = botones.findIndex((b) => b.dataset.pestana === actual);
    const despues = botones.findIndex((b) => b.dataset.pestana === nombre);
    actual = nombre;
    if (!animar || antes < 0) return cambiar(nombre);

    transicion(() => cambiar(nombre), {
      tipo: 'pestana', direccion: despues > antes ? 'adelante' : 'atras',
    }).then((hubo) => {
      if (hubo || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const panel = document.querySelector(`[data-panel="${nombre}"]`);
      panel?.classList.remove('panel--aparece');
      void panel?.offsetWidth;
      panel?.classList.add('panel--aparece');
    });
  };
  botones.forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.pestana)));
  const inicial = location.hash.slice(1);
  mostrar(botones.some((b) => b.dataset.pestana === inicial) ? inicial : botones[0].dataset.pestana, false);
  return mostrar;
}

/** Convierte "Dulce Tentación" en "dulce-tentacion-x7k2" */
export function crearSlug(nombre) {
  const base = String(nombre).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tienda';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}
