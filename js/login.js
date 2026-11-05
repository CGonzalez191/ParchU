// Iniciar sesión y crear cuenta.
import { supabase } from './supabase.js';
import { obtenerUsuario } from './sesion.js';
import { traducirError, parametro, transicion } from './util.js';

const tabEntrar    = document.getElementById('tabEntrar');
const tabRegistro  = document.getElementById('tabRegistro');
const formEntrar   = document.getElementById('formEntrar');
const formRegistro = document.getElementById('formRegistro');

// A dónde ir después de entrar (?volver=mis-pedidos.html). Solo páginas internas.
function destino() {
  const volver = parametro('volver');
  if (volver && /^[\w-]+\.html(\?[\w=&%.-]*)?$/.test(volver)) return volver;
  return 'index.html';
}

// Si ya tiene sesión, no tiene sentido mostrar este formulario
obtenerUsuario().then((u) => { if (u) location.replace(destino()); });

// ---------------------------------------------------------
// Pestañas
// ---------------------------------------------------------
function cambiar(registro) {
  tabEntrar.setAttribute('aria-selected', String(!registro));
  tabRegistro.setAttribute('aria-selected', String(registro));
  formEntrar.classList.toggle('oculto', registro);
  formRegistro.classList.toggle('oculto', !registro);
  (registro ? formRegistro : formEntrar).querySelector('input').focus({ preventScroll: true });
}

// El cambio entre formularios "se transforma": los campos que comparten
// (título, correo, contraseña, botón) se deslizan a su nuevo lugar y los
// demás entran o salen por el lado. Si el navegador no tiene View
// Transitions, el formulario nuevo entra con una animación sencilla.
let modoActual = 'entrar';   // se actualiza al instante, aunque la animación siga
function mostrar(modo, { animar = true } = {}) {
  const registro = modo === 'registro';
  if (modoActual === modo) return;
  modoActual = modo;

  if (!animar) return cambiar(registro);
  transicion(() => cambiar(registro), {
    tipo: 'acceso', direccion: registro ? 'adelante' : 'atras',
  }).then((hubo) => {
    if (hubo || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const form = registro ? formRegistro : formEntrar;
    form.classList.remove('formulario--aparece');
    void form.offsetWidth;
    form.classList.add('formulario--aparece');
  });
}
tabEntrar.addEventListener('click', () => mostrar('entrar'));
tabRegistro.addEventListener('click', () => mostrar('registro'));
if (parametro('modo') === 'registro') mostrar('registro', { animar: false });

// ---------------------------------------------------------
// Mensajes del formulario
// ---------------------------------------------------------
function mensaje(form, texto, tipo = 'error') {
  const caja = form.querySelector('[data-mensaje]');
  caja.textContent = texto;
  caja.className = `alerta alerta--${tipo}`;
  caja.classList.toggle('oculto', !texto);
}

function ocupado(form, si, texto) {
  const boton = form.querySelector('button[type="submit"]');
  boton.disabled = si;
  if (si) { boton.dataset.texto = boton.textContent; boton.textContent = texto; }
  else if (boton.dataset.texto) boton.textContent = boton.dataset.texto;
}

// ---------------------------------------------------------
// Iniciar sesión
// ---------------------------------------------------------
formEntrar.addEventListener('submit', async (e) => {
  e.preventDefault();
  const correo = formEntrar.correo.value.trim();
  const clave  = formEntrar.clave.value;

  if (!correo || !clave) return mensaje(formEntrar, 'Escribe tu correo y tu contraseña.');

  mensaje(formEntrar, '');
  ocupado(formEntrar, true, 'Entrando…');

  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });

  ocupado(formEntrar, false);
  if (error) return mensaje(formEntrar, traducirError(error));
  location.replace(destino());
});

// ---------------------------------------------------------
// Crear cuenta
// ---------------------------------------------------------
formRegistro.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre   = formRegistro.nombre.value.trim();
  const telefono = formRegistro.telefono.value.replace(/\D/g, '');
  const correo   = formRegistro.correo.value.trim();
  const clave    = formRegistro.clave.value;

  if (!nombre)  return mensaje(formRegistro, 'Escribe tu nombre.');
  if (telefono && telefono.length !== 10) return mensaje(formRegistro, 'El celular debe tener 10 números.');
  if (!correo)  return mensaje(formRegistro, 'Escribe tu correo.');
  if (clave.length < 6) return mensaje(formRegistro, 'La contraseña debe tener al menos 6 caracteres.');

  mensaje(formRegistro, '');
  ocupado(formRegistro, true, 'Creando cuenta…');

  // El nombre y el celular quedan en el perfil automáticamente
  // (lo hace la base de datos al registrar al usuario).
  const { data, error } = await supabase.auth.signUp({
    email: correo,
    password: clave,
    options: { data: { nombre, telefono: telefono || null } },
  });

  ocupado(formRegistro, false);
  if (error) {
    // Deja el detalle técnico en la consola para poder diagnosticar
    console.error('Error al crear cuenta:', error.code ?? '', error.status ?? '', error.message);
    return mensaje(formRegistro, traducirError(error));
  }

  if (data.session) {
    // La confirmación por correo está desactivada: entra de una vez
    location.replace(destino());
  } else {
    formRegistro.reset();
    mensaje(formRegistro,
      `Te enviamos un correo a ${correo}. Ábrelo para confirmar tu cuenta y luego inicia sesión.`, 'ok');
  }
});
