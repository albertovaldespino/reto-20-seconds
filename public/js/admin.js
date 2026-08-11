// ============================================================
// CONFIGURACIÓN
// ============================================================
const PREGUNTAS_UI = [
  { columna: "pregunta1", texto: "¿Dormiste 8h?" },
  { columna: "pregunta2", texto: "¿Desayunaste?" },
  { columna: "pregunta3", texto: "¿Ejercicio?" },
  { columna: "pregunta4", texto: "¿Alegre?" },
  { columna: "pregunta5", texto: "¿Ves bien?" },
  { columna: "pregunta6", texto: "¿Dientes?" },
];

const contenedorLogin = document.getElementById("contenedorLogin");
const contenedorDashboard = document.getElementById("contenedorDashboard");
const formLogin = document.getElementById("formLogin");
const inputPassword = document.getElementById("inputPassword");
const errorLogin = document.getElementById("errorLogin");
const btnEntrar = document.getElementById("btnEntrar");

// ============================================================
// VERIFICAR SESIÓN AL CARGAR
// ============================================================
async function verificarSesion() {
  try {
    const res = await fetch("/api/admin/sesion");
    const datos = await res.json();
    if (datos.ok && datos.autenticado) {
      mostrarDashboard();
    } else {
      mostrarLogin();
    }
  } catch {
    mostrarLogin();
  }
}

function mostrarLogin() {
  contenedorLogin.style.display = "";
  contenedorDashboard.style.display = "none";
}

function mostrarDashboard() {
  contenedorLogin.style.display = "none";
  contenedorDashboard.style.display = "";
  cargarDashboard();
}

// ============================================================
// LOGIN
// ============================================================
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorLogin.classList.remove("visible");
  btnEntrar.disabled = true;
  btnEntrar.textContent = "Ingresando…";

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: inputPassword.value }),
    });
    const datos = await res.json();

    if (res.ok && datos.ok) {
      inputPassword.value = "";
      mostrarDashboard();
    } else {
      errorLogin.textContent = datos.error || "No se pudo iniciar sesión.";
      errorLogin.classList.add("visible");
    }
  } catch {
    errorLogin.textContent = "No hay conexión con el servidor. Inténtalo de nuevo.";
    errorLogin.classList.add("visible");
  } finally {
    btnEntrar.disabled = false;
    btnEntrar.textContent = "Ingresar";
  }
});

document.getElementById("btnSalir").addEventListener("click", async () => {
  try { await fetch("/api/admin/logout", { method: "POST" }); } catch { /* no crítico */ }
  mostrarLogin();
});

// ============================================================
// CARGA DE DATOS DEL DASHBOARD
// ============================================================
async function cargarDashboard() {
  const zonaStats = document.getElementById("zonaStats");
  const zonaGraficas = document.getElementById("zonaGraficas");
  const zonaTabla = document.getElementById("zonaTabla");

  zonaTabla.innerHTML = `<div class="estado-carga">Cargando respuestas…</div>`;

  try {
    const [resResumen, resRespuestas] = await Promise.all([
      fetch("/api/admin/resumen"),
      fetch("/api/admin/respuestas?limite=1000"),
    ]);

    if (resResumen.status === 401 || resRespuestas.status === 401) {
      mostrarLogin();
      return;
    }

    const resumen = await resResumen.json();
    const respuestasData = await resRespuestas.json();

    if (!resumen.ok || !respuestasData.ok) {
      zonaTabla.innerHTML = `<div class="estado-carga">No se pudieron cargar los datos. Intenta actualizar.</div>`;
      return;
    }

    renderStats(resumen);
    renderGraficas(resumen);
    renderTabla(respuestasData);
  } catch (error) {
    zonaTabla.innerHTML = `<div class="estado-carga">Error de conexión al cargar los datos.</div>`;
  }
}

// ============================================================
// TARJETAS DE RESUMEN
// ============================================================
function renderStats(resumen) {
  const zona = document.getElementById("zonaStats");
  zona.innerHTML = `
    <div class="stat-card">
      <span class="num">${resumen.total}</span>
      <span class="lbl">Total respuestas</span>
    </div>
    <div class="stat-card">
      <span class="num">${resumen.por_sexo.Hombre}</span>
      <span class="lbl">Hombres</span>
    </div>
    <div class="stat-card rosa">
      <span class="num">${resumen.por_sexo.Mujer}</span>
      <span class="lbl">Mujeres</span>
    </div>
    <div class="stat-card rojo">
      <span class="num">${resumen.por_resultado.ROJO}</span>
      <span class="lbl">Alertas (rojo)</span>
    </div>
  `;
}

function calcularPct(numero, total) {
  return total > 0 ? Math.round((numero / total) * 100) : 0;
}

// ============================================================
// RESUMEN DEL SEMÁFORO (verde / amarillo / rojo)
// ============================================================
function renderResumenSemaforo(resumen) {
  const total = resumen.total;
  const pr = resumen.por_resultado; // { ROJO, AMARILLO, VERDE }

  return `
    <div class="panel-seccion">
      <h2>Semáforo de resultados</h2>
      <p class="desc">Participantes por color, según el número de respuestas "NO" en las 6 preguntas</p>
      <div class="rejilla-stats rejilla-semaforo">
        <div class="stat-card verde">
          <span class="num">${pr.VERDE}</span>
          <span class="lbl">Verde · ${calcularPct(pr.VERDE, total)}%</span>
        </div>
        <div class="stat-card amarillo">
          <span class="num">${pr.AMARILLO}</span>
          <span class="lbl">Amarillo · ${calcularPct(pr.AMARILLO, total)}%</span>
        </div>
        <div class="stat-card rojo">
          <span class="num">${pr.ROJO}</span>
          <span class="lbl">Rojo · ${calcularPct(pr.ROJO, total)}%</span>
        </div>
      </div>
      <div class="contenedor-chart" id="chartDona">${construirGraficaDona(pr, total)}</div>
    </div>
  `;
}

// ============================================================
// GRÁFICAS (SVG, sin librerías externas)
// ============================================================
function renderGraficas(resumen) {
  const zona = document.getElementById("zonaGraficas");

  zona.innerHTML = `
    <div class="panel-seccion">
      <h2>Respuestas "Sí" por pregunta y sexo</h2>
      <p class="desc">Porcentaje de "Sí" respecto al total de cada sexo</p>
      <div class="leyenda-chart">
        <div class="leyenda-item"><span class="leyenda-punto" style="background:#002B7A"></span>Hombres</div>
        <div class="leyenda-item"><span class="leyenda-punto" style="background:#E4547D"></span>Mujeres</div>
      </div>
      <div class="contenedor-chart" id="chartBarras">${construirGraficaBarras(resumen.preguntas)}</div>
    </div>

    ${renderResumenSemaforo(resumen)}
  `;

  requestAnimationFrame(() => {
    setTimeout(() => {
      const b = document.getElementById("chartBarras");
      const d = document.getElementById("chartDona");
      if (b) b.classList.add("cargado");
      if (d) d.classList.add("cargado");
    }, 60);
  });
}

function construirGraficaBarras(preguntas) {
  const w = 360, h = 210;
  const marginTop = 26, marginBottom = 40, marginSide = 8;
  const usableH = h - marginTop - marginBottom;
  const usableW = w - marginSide * 2;
  const groupW = usableW / preguntas.length;
  const barW = Math.min(20, groupW * 0.32);
  const gap = 6;
  const baseY = marginTop + usableH;

  let barrasSVG = "";
  let etiquetasSVG = "";

  preguntas.forEach((p, i) => {
    const info = PREGUNTAS_UI[i] || { texto: `P${i + 1}` };
    const groupX = marginSide + i * groupW;
    const centerX = groupX + groupW / 2;
    const xH = centerX - gap / 2 - barW;
    const xM = centerX + gap / 2;

    const hH = (usableH * p.pct_si_hombre) / 100;
    const hM = (usableH * p.pct_si_mujer) / 100;
    const yH = baseY - hH;
    const yM = baseY - hM;

    barrasSVG += `
      <g>
        <rect class="barra-grupo" x="${xH.toFixed(1)}" y="${yH.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(hH,1).toFixed(1)}" rx="4" fill="url(#gradAzul)" />
        <text x="${(xH + barW / 2).toFixed(1)}" y="${(yH - 5).toFixed(1)}" font-size="9" font-weight="700" fill="#003DA5" text-anchor="middle" font-family="Inter, sans-serif">${p.pct_si_hombre}%</text>
        <rect class="barra-grupo" x="${xM.toFixed(1)}" y="${yM.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(hM,1).toFixed(1)}" rx="4" fill="url(#gradRosa)" />
        <text x="${(xM + barW / 2).toFixed(1)}" y="${(yM - 5).toFixed(1)}" font-size="9" font-weight="700" fill="#E4547D" text-anchor="middle" font-family="Inter, sans-serif">${p.pct_si_mujer}%</text>
      </g>`;

    etiquetasSVG += `<text x="${centerX.toFixed(1)}" y="${(baseY + 18).toFixed(1)}" font-size="9.5" font-weight="700" fill="#626A7A" text-anchor="middle" font-family="Inter, sans-serif">${info.texto}</text>`;
  });

  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Porcentaje de Sí por pregunta y sexo">
      <defs>
        <linearGradient id="gradAzul" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0047C4"/>
          <stop offset="100%" stop-color="#002B7A"/>
        </linearGradient>
        <linearGradient id="gradRosa" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#F17C9C"/>
          <stop offset="100%" stop-color="#E4547D"/>
        </linearGradient>
      </defs>
      <line x1="${marginSide}" y1="${baseY}" x2="${w - marginSide}" y2="${baseY}" stroke="#D6DCEA" stroke-width="1.2"/>
      ${barrasSVG}
      ${etiquetasSVG}
    </svg>`;
}

function construirGraficaDona(porResultado, total) {
  const size = 200;
  const r = 70;
  const cx = size / 2, cy = size / 2;
  const circunferencia = 2 * Math.PI * r;

  const fraccionVerde = total > 0 ? porResultado.VERDE / total : 0;
  const fraccionAmarillo = total > 0 ? porResultado.AMARILLO / total : 0;
  const fraccionRojo = total > 0 ? porResultado.ROJO / total : 0;

  const largoVerde = circunferencia * fraccionVerde;
  const largoAmarillo = circunferencia * fraccionAmarillo;
  const largoRojo = circunferencia * fraccionRojo;

  const offsetAmarillo = -largoVerde;
  const offsetRojo = -(largoVerde + largoAmarillo);

  const pctAtencion = Math.round((fraccionAmarillo + fraccionRojo) * 100);

  return `
    <svg viewBox="0 0 ${size} ${size}" width="200" height="200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Proporción de resultados verde, amarillo y rojo">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E1E6F0" stroke-width="26"/>
      <circle class="rebanada-dona" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1E8E5A" stroke-width="26"
        stroke-dasharray="${largoVerde.toFixed(1)} ${circunferencia.toFixed(1)}"
        transform="rotate(-90 ${cx} ${cy})"/>
      <circle class="rebanada-dona" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#F9A825" stroke-width="26"
        stroke-dasharray="${largoAmarillo.toFixed(1)} ${circunferencia.toFixed(1)}"
        stroke-dashoffset="${offsetAmarillo.toFixed(1)}"
        transform="rotate(-90 ${cx} ${cy})"/>
      <circle class="rebanada-dona" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#C5372F" stroke-width="26"
        stroke-dasharray="${largoRojo.toFixed(1)} ${circunferencia.toFixed(1)}"
        stroke-dashoffset="${offsetRojo.toFixed(1)}"
        transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy - 2}" font-size="24" font-weight="700" fill="#002B7A" text-anchor="middle" font-family="Fraunces, serif">${pctAtencion}%</text>
      <text x="${cx}" y="${cy + 14}" font-size="9" font-weight="700" fill="#626A7A" text-anchor="middle" font-family="Inter, sans-serif">AMARILLO</text>
      <text x="${cx}" y="${cy + 25}" font-size="9" font-weight="700" fill="#626A7A" text-anchor="middle" font-family="Inter, sans-serif">+ ROJO</text>
    </svg>`;
}

// ============================================================
// TABLA DE RESPUESTAS
// ============================================================
function formatearFecha(iso) {
  try {
    const f = new Date(iso);
    return f.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function pillSiNo(valor) {
  // Registros anteriores a la migración pueden no tener pregunta6.
  if (valor === null || valor === undefined) {
    return `<span class="pill">—</span>`;
  }
  return valor
    ? `<span class="pill si">SÍ</span>`
    : `<span class="pill no">NO</span>`;
}

function claseResultado(resultado) {
  if (resultado === "ROJO") return "rojo";
  if (resultado === "AMARILLO") return "amarillo";
  return "verde";
}

function renderTabla(data) {
  const zona = document.getElementById("zonaTabla");

  if (!data.respuestas || data.respuestas.length === 0) {
    zona.innerHTML = `<div class="vacio-stats">Aún no hay respuestas registradas.</div>`;
    return;
  }

  const filas = data.respuestas.map((r) => `
    <tr>
      <td>${r.id}</td>
      <td>${formatearFecha(r.fecha_hora)}</td>
      <td>${r.sexo_asignado_nacer}</td>
      <td>${pillSiNo(r.pregunta1)}</td>
      <td>${pillSiNo(r.pregunta2)}</td>
      <td>${pillSiNo(r.pregunta3)}</td>
      <td>${pillSiNo(r.pregunta4)}</td>
      <td>${pillSiNo(r.pregunta5)}</td>
      <td>${pillSiNo(r.pregunta6)}</td>
      <td>${r.numero_respuestas_no === null || r.numero_respuestas_no === undefined ? "—" : r.numero_respuestas_no}</td>
      <td><span class="pill ${claseResultado(r.resultado)}">${r.resultado}</span></td>
    </tr>
  `).join("");

  zona.innerHTML = `
    <div class="panel-seccion">
      <h2>Tabla de respuestas</h2>
      <p class="desc">Registros más recientes primero</p>
      <div class="contenedor-tabla">
        <table class="tabla-respuestas">
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha y hora</th>
              <th>Sexo</th>
              <th>P1</th>
              <th>P2</th>
              <th>P3</th>
              <th>P4</th>
              <th>P5</th>
              <th>P6</th>
              <th>Núm. NO</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <div class="pie-tabla">
        <span>Mostrando ${data.respuestas.length} de ${data.total} registro(s)</span>
      </div>
    </div>
  `;
}

// ============================================================
// BOTONES DE ACCIÓN
// ============================================================
document.getElementById("btnActualizar").addEventListener("click", cargarDashboard);

// El botón de descarga es un <a href="/api/admin/csv">; el navegador envía
// la cookie de sesión automáticamente y descarga el archivo generado por el servidor.

verificarSesion();
