// ============================================================
// CONFIGURACIÓN
// ============================================================
const ENDPOINT_RESPUESTAS = "/api/respuestas";
const CLAVE_RESPALDO = "reto20s_pendiente"; // respaldo temporal SOLO por si falla el envío

const PREGUNTAS = [
  { campo: "pregunta1", texto: "¿Dormiste al menos 8 horas anoche?" },
  { campo: "pregunta2", texto: "¿Desayunaste antes de salir de tu casa?" },
  { campo: "pregunta3", texto: "¿Hiciste ejercicio esta semana?" },
  { campo: "pregunta4", texto: "¿Te has sentido alegre esta semana?" },
  { campo: "pregunta5", texto: "¿Ves bien?" },
  { campo: "pregunta6", texto: "Esta semana, ¿te has ido a dormir sin lavarte los dientes?" },
];

// ============================================================
// ESTADO
// ============================================================
const estado = {
  sexo: null,
  respuestas: {}, // { pregunta1: "Si" | "No", ... }
};

// ============================================================
// RENDER DE PREGUNTAS
// ============================================================
const listaPreguntas = document.getElementById("listaPreguntas");

PREGUNTAS.forEach((preg, idx) => {
  const tarjeta = document.createElement("div");
  tarjeta.className = "tarjeta-pregunta";
  tarjeta.id = `tarjeta-${preg.campo}`;
  tarjeta.innerHTML = `
    <div class="fila-pregunta">
      <div class="numero-pregunta">${idx + 1}</div>
      <p class="pregunta-texto" style="margin:0;">${preg.texto}</p>
    </div>
    <div class="botones-sino" data-grupo="${preg.campo}">
      <button type="button" class="btn-sn si" data-valor="Si">SÍ</button>
      <button type="button" class="btn-sn no" data-valor="No">NO</button>
    </div>
  `;
  listaPreguntas.appendChild(tarjeta);
});

// ============================================================
// INTERACCIÓN
// ============================================================
function actualizarProgreso() {
  const total = PREGUNTAS.length + 1; // +1 por sexo
  const contestadas = Object.keys(estado.respuestas).length + (estado.sexo ? 1 : 0);
  const pct = Math.min(100, Math.round((contestadas / total) * 100));
  document.getElementById("barraProgreso").style.width = pct + "%";
}

document.querySelectorAll('.chip[data-valor]').forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('.chips-fila[data-grupo="sexo"] .chip').forEach(b => b.classList.remove("activo"));
    btn.classList.add("activo");
    estado.sexo = btn.dataset.valor;
    actualizarProgreso();
  });
});

listaPreguntas.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-sn");
  if (!btn) return;
  const grupo = btn.parentElement.dataset.grupo;
  const tarjeta = document.getElementById(`tarjeta-${grupo}`);
  tarjeta.querySelectorAll(".btn-sn").forEach(b => b.classList.remove("activo"));
  btn.classList.add("activo");
  tarjeta.classList.add("respondida");
  estado.respuestas[grupo] = btn.dataset.valor;
  actualizarProgreso();
});

// ============================================================
// VALIDACIÓN Y AVISOS
// ============================================================
const avisoValidacion = document.getElementById("avisoValidacion");
const textoAviso = document.getElementById("textoAviso");
let avisoTimeout = null;

function mostrarAviso(mensaje, esError = false) {
  textoAviso.textContent = mensaje;
  avisoValidacion.classList.toggle("error", esError);
  avisoValidacion.classList.add("visible");
  clearTimeout(avisoTimeout);
  avisoTimeout = setTimeout(() => avisoValidacion.classList.remove("visible"), 3800);
}

function validarCompleto() {
  if (!estado.sexo) {
    mostrarAviso("⚠️ Falta seleccionar tu sexo asignado al nacer");
    document.querySelector(".tarjeta-demografico").scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }
  for (const preg of PREGUNTAS) {
    if (!estado.respuestas[preg.campo]) {
      mostrarAviso(`⚠️ Falta responder: "${preg.texto}"`);
      document.getElementById(`tarjeta-${preg.campo}`).scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
  }
  return true;
}

// ============================================================
// CONSTRUCCIÓN DEL PAYLOAD
// ============================================================
function construirPayload() {
  const payload = { sexo_asignado_nacer: estado.sexo };
  PREGUNTAS.forEach(preg => {
    payload[preg.campo] = estado.respuestas[preg.campo] === "Si";
  });
  return payload;
}

// ============================================================
// PANTALLAS
// ============================================================
const formulario = document.getElementById("formulario");
const cabecera = document.querySelector(".cabecera");
const barraFinalizar = document.querySelector(".barra-finalizar");
const btnFinalizar = document.getElementById("btnFinalizar");

const pantallaEnvio = document.getElementById("pantallaEnvio");
const pantallaAlerta = document.getElementById("pantallaAlerta");
const pantallaAmarilla = document.getElementById("pantallaAmarilla");
const pantallaVerde = document.getElementById("pantallaVerde");

function ocultarFormulario() {
  formulario.style.display = "none";
  barraFinalizar.style.display = "none";
  cabecera.style.display = "none";
}

function mostrarFormulario() {
  formulario.style.display = "";
  barraFinalizar.style.display = "";
  cabecera.style.display = "";
  pantallaEnvio.classList.remove("visible", "error");
}

function mostrarEnviando() {
  ocultarFormulario();
  pantallaEnvio.classList.remove("error");
  pantallaEnvio.innerHTML = `
    <div class="spinner"></div>
    <h1>Enviando tu respuesta…</h1>
    <p>Un momento, esto solo toma unos segundos.</p>
  `;
  pantallaEnvio.classList.add("visible");
}

function mostrarErrorEnvio(mensaje) {
  pantallaEnvio.classList.add("error");
  pantallaEnvio.innerHTML = `
    <div class="icono">⚠️</div>
    <h1>No se pudo registrar tu respuesta</h1>
    <p>${mensaje}</p>
    <button type="button" class="btn-reintentar" id="btnReintentar">Reintentar envío</button>
  `;
  pantallaEnvio.classList.add("visible");
  document.getElementById("btnReintentar").addEventListener("click", reintentarEnvio);
}

function mostrarResultado(resultado, id) {
  pantallaEnvio.classList.remove("visible");

  // El color mostrado viene SIEMPRE del resultado confirmado por el
  // servidor (nunca de un cálculo hecho en el navegador).
  let claseBody, pantalla;
  if (resultado === "ROJO") {
    claseBody = "estado-alerta";
    pantalla = pantallaAlerta;
  } else if (resultado === "AMARILLO") {
    claseBody = "estado-amarillo";
    pantalla = pantallaAmarilla;
  } else {
    claseBody = "estado-verde";
    pantalla = pantallaVerde;
  }

  document.body.classList.add(claseBody);
  pantalla.querySelector(".indicador-registro").textContent = `✓ Respuesta registrada${id ? " · #" + id : ""}`;
  pantalla.classList.add("visible");
}

// ============================================================
// ENVÍO AL SERVIDOR
// ============================================================
let payloadPendiente = null;

async function enviarRespuesta(payload) {
  mostrarEnviando();
  payloadPendiente = payload;

  // Respaldo temporal SOLO por si falla el envío (no es la fuente oficial de datos).
  try { localStorage.setItem(CLAVE_RESPALDO, JSON.stringify(payload)); } catch { /* no crítico */ }

  let respuesta;
  try {
    respuesta = await fetch(ENDPOINT_RESPUESTAS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (errorRed) {
    mostrarErrorEnvio("No hay conexión a Internet o el servidor no responde. Verifica tu red e inténtalo de nuevo.");
    return;
  }

  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  if (!respuesta.ok || !datos || datos.ok !== true) {
    const mensajeServidor = datos && datos.error ? datos.error : "Ocurrió un problema al guardar tu respuesta.";
    mostrarErrorEnvio(mensajeServidor + " Tus respuestas no se han perdido: puedes reintentar.");
    return;
  }

  // Confirmado por el servidor: ahora sí se limpia el respaldo y se muestra el resultado.
  try { localStorage.removeItem(CLAVE_RESPALDO); } catch { /* no crítico */ }
  mostrarResultado(datos.resultado, datos.id);
}

function reintentarEnvio() {
  if (payloadPendiente) enviarRespuesta(payloadPendiente);
}

// ============================================================
// FINALIZAR
// ============================================================
btnFinalizar.addEventListener("click", () => {
  if (!validarCompleto()) return;
  const payload = construirPayload();
  enviarRespuesta(payload);
});

actualizarProgreso();
