/**
 * Reto 20 Seconds - Servidor
 * ---------------------------------------------------------
 * Node.js + Express + PostgreSQL
 *
 * Sirve el cuestionario del alumno (index.html), el panel de
 * administrador (admin.html) y los endpoints de la API.
 *
 * Variables de entorno requeridas (ver README.md):
 *   DATABASE_URL     - cadena de conexión a PostgreSQL
 *   ADMIN_PASSWORD   - contraseña del panel de administrador
 *   PORT             - puerto (Render lo define automáticamente)
 *   NODE_ENV         - "production" en Render
 *   SESSION_SECRET   - (opcional) secreto para firmar la cookie de sesión
 */

require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");

// ============================================================
// VALIDACIÓN DE CONFIGURACIÓN
// ============================================================
if (!process.env.DATABASE_URL) {
  console.error(
    "ERROR: falta la variable de entorno DATABASE_URL. Define la cadena de conexión a PostgreSQL antes de iniciar el servidor."
  );
  process.exit(1);
}

if (!process.env.ADMIN_PASSWORD) {
  console.error(
    "ERROR: falta la variable de entorno ADMIN_PASSWORD. Define una contraseña para el panel de administrador."
  );
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const ES_PRODUCCION = NODE_ENV === "production";

// Secreto para firmar la cookie de sesión del admin.
// Si no se define SESSION_SECRET, se deriva de ADMIN_PASSWORD (recomendamos
// definir SESSION_SECRET por separado en producción; ver README.md).
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash("sha256").update(String(process.env.ADMIN_PASSWORD)).digest("hex");

const NOMBRE_COOKIE_ADMIN = "admin_token";
const DURACION_SESION_MS = 8 * 60 * 60 * 1000; // 8 horas

// ------------------------------------------------------------
// Semáforo de resultado (6 preguntas), calculado a partir del
// número de respuestas "NO". Esta es la ÚNICA fuente de verdad:
// el backend nunca confía en un resultado calculado en el navegador.
//
//   0, 1 o 2 "NO"  -> VERDE
//   exactamente 3   -> AMARILLO
//   4, 5 o 6 "NO"  -> ROJO
// ------------------------------------------------------------
const NUMERO_PREGUNTAS = 6;
const LIMITE_AMARILLO = 3; // exactamente este número de "NO" -> amarillo
const LIMITE_ROJO = 4; // este número de "NO" o más -> rojo

function calcularResultado(numeroNo) {
  if (numeroNo >= LIMITE_ROJO) return "ROJO";
  if (numeroNo === LIMITE_AMARILLO) return "AMARILLO";
  return "VERDE";
}

// ============================================================
// CONEXIÓN A POSTGRESQL
// ============================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: ES_PRODUCCION ? { rejectUnauthorized: false } : false,
});

async function inicializarBaseDeDatos() {
  // Creación de la tabla si no existe (instalación nueva): ya incluye las
  // 6 preguntas y el semáforo de 3 colores desde el inicio.
  const sqlCreacion = `
    CREATE TABLE IF NOT EXISTS respuestas (
      id                    SERIAL PRIMARY KEY,
      sexo_asignado_nacer   VARCHAR(10)  NOT NULL CHECK (sexo_asignado_nacer IN ('Hombre', 'Mujer')),
      pregunta1             BOOLEAN      NOT NULL,
      pregunta2             BOOLEAN      NOT NULL,
      pregunta3             BOOLEAN      NOT NULL,
      pregunta4             BOOLEAN      NOT NULL,
      pregunta5             BOOLEAN      NOT NULL,
      pregunta6             BOOLEAN      NOT NULL,
      total_si              SMALLINT     NOT NULL,
      numero_respuestas_no  SMALLINT     NOT NULL,
      resultado             VARCHAR(10)  NOT NULL CHECK (resultado IN ('ROJO', 'AMARILLO', 'VERDE')),
      fecha_hora            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `;
  await pool.query(sqlCreacion);

  // Migración segura para instalaciones existentes (proyecto ya desplegado
  // con la versión de 5 preguntas). Todo es aditivo: nunca se borra ni se
  // recrea la tabla, y las columnas nuevas se agregan sin NOT NULL para no
  // romper los registros históricos que no tienen pregunta6.
  const sqlMigracion = `
    ALTER TABLE respuestas ADD COLUMN IF NOT EXISTS pregunta6 BOOLEAN;
    ALTER TABLE respuestas ADD COLUMN IF NOT EXISTS numero_respuestas_no SMALLINT;
    ALTER TABLE respuestas DROP CONSTRAINT IF EXISTS respuestas_resultado_check;
    ALTER TABLE respuestas ADD CONSTRAINT respuestas_resultado_check CHECK (resultado IN ('ROJO', 'AMARILLO', 'VERDE'));
  `;
  await pool.query(sqlMigracion);

  console.log("Tabla 'respuestas' verificada/creada/migrada correctamente (6 preguntas + semáforo de 3 colores).");
}

// ============================================================
// APP EXPRESS
// ============================================================
const app = express();

// Render y otros proxies inversos: necesario para que "secure" en cookies
// y la detección de HTTPS funcionen correctamente.
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
  })
);

app.use(express.json({ limit: "15kb" }));
app.use(cookieParser());

// Archivos estáticos: CSS, JS del cliente e imágenes (no expone server.js, .env, etc.)
app.use("/public", express.static(path.join(__dirname, "public")));

// ============================================================
// UTILIDADES DE SESIÓN DE ADMINISTRADOR (cookie firmada, sin dependencias extra)
// ============================================================
function firmarToken(expiraEn) {
  const firma = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(`admin:${expiraEn}`)
    .digest("hex");
  return `${expiraEn}.${firma}`;
}

function tokenValido(token) {
  if (!token || typeof token !== "string") return false;
  const partes = token.split(".");
  if (partes.length !== 2) return false;

  const [expiraEnStr, firma] = partes;
  const expiraEn = Number(expiraEnStr);
  if (!Number.isFinite(expiraEn) || Date.now() > expiraEn) return false;

  const firmaEsperada = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(`admin:${expiraEn}`)
    .digest("hex");

  const bufA = Buffer.from(firma);
  const bufB = Buffer.from(firmaEsperada);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requiereAdmin(req, res, next) {
  const token = req.cookies ? req.cookies[NOMBRE_COOKIE_ADMIN] : null;
  if (!tokenValido(token)) {
    return res.status(401).json({ ok: false, error: "No autorizado. Inicia sesión como administrador." });
  }
  next();
}

// ============================================================
// VALIDACIÓN DE ENTRADA (cuestionario del alumno)
// ============================================================
function validarPayloadRespuesta(body) {
  const errores = [];

  if (!body || typeof body !== "object") {
    return { valido: false, errores: ["Cuerpo de la solicitud inválido."] };
  }

  const { sexo_asignado_nacer, pregunta1, pregunta2, pregunta3, pregunta4, pregunta5, pregunta6 } = body;

  if (sexo_asignado_nacer !== "Hombre" && sexo_asignado_nacer !== "Mujer") {
    errores.push("sexo_asignado_nacer debe ser 'Hombre' o 'Mujer'.");
  }

  const preguntas = { pregunta1, pregunta2, pregunta3, pregunta4, pregunta5, pregunta6 };
  for (const [clave, valor] of Object.entries(preguntas)) {
    if (typeof valor !== "boolean") {
      errores.push(`${clave} debe ser un valor booleano (true/false).`);
    }
  }

  return { valido: errores.length === 0, errores };
}

// ============================================================
// LIMITADOR DE INTENTOS DE LOGIN (protección básica contra fuerza bruta)
// ============================================================
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máximo 10 intentos por IP en la ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
});

// ============================================================
// RUTAS: PÁGINAS
// ============================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// Verificación de salud (útil para Render y para confirmar que el servidor responde)
app.get("/health", (req, res) => {
  res.json({ ok: true, entorno: NODE_ENV });
});

// ============================================================
// API PÚBLICA: CUESTIONARIO DEL ALUMNO
// ============================================================
app.post("/api/respuestas", async (req, res) => {
  const { valido, errores } = validarPayloadRespuesta(req.body);
  if (!valido) {
    return res.status(400).json({ ok: false, error: "Datos inválidos.", detalles: errores });
  }

  const { sexo_asignado_nacer, pregunta1, pregunta2, pregunta3, pregunta4, pregunta5, pregunta6 } = req.body;
  const respuestas = [pregunta1, pregunta2, pregunta3, pregunta4, pregunta5, pregunta6];

  // Cálculo OFICIAL del servidor: nunca se confía en un resultado enviado
  // desde el navegador (el cliente solo envía las 6 respuestas booleanas).
  const totalSi = respuestas.filter(Boolean).length;
  const numeroNo = NUMERO_PREGUNTAS - totalSi;
  const resultado = calcularResultado(numeroNo);

  try {
    const sql = `
      INSERT INTO respuestas
        (sexo_asignado_nacer, pregunta1, pregunta2, pregunta3, pregunta4, pregunta5, pregunta6,
         total_si, numero_respuestas_no, resultado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, fecha_hora;
    `;
    const valores = [
      sexo_asignado_nacer,
      pregunta1,
      pregunta2,
      pregunta3,
      pregunta4,
      pregunta5,
      pregunta6,
      totalSi,
      numeroNo,
      resultado,
    ];
    const resultadoQuery = await pool.query(sql, valores);
    const fila = resultadoQuery.rows[0];

    return res.status(201).json({
      ok: true,
      id: fila.id,
      fecha_hora: fila.fecha_hora,
      resultado,
      total_si: totalSi,
      numero_respuestas_no: numeroNo,
    });
  } catch (error) {
    console.error("Error al guardar respuesta:", error.message);
    return res.status(500).json({ ok: false, error: "No se pudo guardar la respuesta. Intenta de nuevo." });
  }
});

// ============================================================
// API ADMIN: LOGIN / LOGOUT
// ============================================================
app.post("/api/admin/login", limitadorLogin, (req, res) => {
  const { password } = req.body || {};

  if (typeof password !== "string" || password.length === 0) {
    return res.status(400).json({ ok: false, error: "Falta la contraseña." });
  }

  const bufIngresada = Buffer.from(password);
  const bufReal = Buffer.from(String(process.env.ADMIN_PASSWORD));

  const coincide =
    bufIngresada.length === bufReal.length && crypto.timingSafeEqual(bufIngresada, bufReal);

  if (!coincide) {
    return res.status(401).json({ ok: false, error: "Contraseña incorrecta." });
  }

  const expiraEn = Date.now() + DURACION_SESION_MS;
  const token = firmarToken(expiraEn);

  res.cookie(NOMBRE_COOKIE_ADMIN, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: ES_PRODUCCION,
    maxAge: DURACION_SESION_MS,
    path: "/",
  });

  return res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie(NOMBRE_COOKIE_ADMIN, { path: "/" });
  return res.json({ ok: true });
});

app.get("/api/admin/sesion", (req, res) => {
  const token = req.cookies ? req.cookies[NOMBRE_COOKIE_ADMIN] : null;
  return res.json({ ok: true, autenticado: tokenValido(token) });
});

// ============================================================
// API ADMIN: DATOS (protegidos)
// ============================================================
const PREGUNTAS_COLUMNAS = ["pregunta1", "pregunta2", "pregunta3", "pregunta4", "pregunta5", "pregunta6"];

app.get("/api/admin/resumen", requiereAdmin, async (req, res) => {
  try {
    const totalQuery = await pool.query("SELECT COUNT(*)::int AS total FROM respuestas;");
    const total = totalQuery.rows[0].total;

    const sexoQuery = await pool.query(
      `SELECT sexo_asignado_nacer, COUNT(*)::int AS total
       FROM respuestas GROUP BY sexo_asignado_nacer;`
    );
    const porSexo = { Hombre: 0, Mujer: 0 };
    sexoQuery.rows.forEach((fila) => {
      porSexo[fila.sexo_asignado_nacer] = fila.total;
    });

    const resultadoQuery = await pool.query(
      `SELECT resultado, COUNT(*)::int AS total FROM respuestas GROUP BY resultado;`
    );
    const porResultado = { ROJO: 0, AMARILLO: 0, VERDE: 0 };
    resultadoQuery.rows.forEach((fila) => {
      porResultado[fila.resultado] = fila.total;
    });

    // Conteo de "Sí" por pregunta, general y desglosado por sexo
    const columnasSelect = PREGUNTAS_COLUMNAS.map(
      (col) => `SUM(CASE WHEN ${col} THEN 1 ELSE 0 END)::int AS ${col}_si`
    ).join(", ");

    const generalQuery = await pool.query(`SELECT ${columnasSelect} FROM respuestas;`);
    const porSexoQuery = await pool.query(
      `SELECT sexo_asignado_nacer, ${columnasSelect} FROM respuestas GROUP BY sexo_asignado_nacer;`
    );

    const preguntas = PREGUNTAS_COLUMNAS.map((col, idx) => {
      const siGeneral = generalQuery.rows[0] ? generalQuery.rows[0][`${col}_si`] || 0 : 0;
      const filaHombre = porSexoQuery.rows.find((f) => f.sexo_asignado_nacer === "Hombre");
      const filaMujer = porSexoQuery.rows.find((f) => f.sexo_asignado_nacer === "Mujer");

      return {
        columna: col,
        numero: idx + 1,
        si_total: siGeneral,
        no_total: total - siGeneral,
        pct_si: total > 0 ? Math.round((siGeneral / total) * 100) : 0,
        si_hombre: filaHombre ? filaHombre[`${col}_si`] || 0 : 0,
        si_mujer: filaMujer ? filaMujer[`${col}_si`] || 0 : 0,
        pct_si_hombre:
          porSexo.Hombre > 0 && filaHombre ? Math.round(((filaHombre[`${col}_si`] || 0) / porSexo.Hombre) * 100) : 0,
        pct_si_mujer:
          porSexo.Mujer > 0 && filaMujer ? Math.round(((filaMujer[`${col}_si`] || 0) / porSexo.Mujer) * 100) : 0,
      };
    });

    return res.json({
      ok: true,
      total,
      por_sexo: porSexo,
      por_resultado: porResultado,
      preguntas,
    });
  } catch (error) {
    console.error("Error al calcular resumen:", error.message);
    return res.status(500).json({ ok: false, error: "No se pudo calcular el resumen." });
  }
});

app.get("/api/admin/respuestas", requiereAdmin, async (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 500, 5000);
  const pagina = Math.max(Number(req.query.pagina) || 0, 0);
  const offset = pagina * limite;

  try {
    const sql = `
      SELECT id, sexo_asignado_nacer, pregunta1, pregunta2, pregunta3, pregunta4, pregunta5, pregunta6,
             total_si, numero_respuestas_no, resultado, fecha_hora
      FROM respuestas
      ORDER BY fecha_hora DESC
      LIMIT $1 OFFSET $2;
    `;
    const resultado = await pool.query(sql, [limite, offset]);
    const totalQuery = await pool.query("SELECT COUNT(*)::int AS total FROM respuestas;");

    return res.json({ ok: true, total: totalQuery.rows[0].total, respuestas: resultado.rows });
  } catch (error) {
    console.error("Error al listar respuestas:", error.message);
    return res.status(500).json({ ok: false, error: "No se pudieron obtener las respuestas." });
  }
});

app.get("/api/admin/csv", requiereAdmin, async (req, res) => {
  try {
    const sql = `
      SELECT id, fecha_hora, sexo_asignado_nacer, pregunta1, pregunta2, pregunta3, pregunta4, pregunta5, pregunta6,
             total_si, numero_respuestas_no, resultado
      FROM respuestas
      ORDER BY fecha_hora ASC;
    `;
    const resultado = await pool.query(sql);

    const columnas = [
      "id",
      "fecha_hora",
      "sexo_asignado_nacer",
      "pregunta1",
      "pregunta2",
      "pregunta3",
      "pregunta4",
      "pregunta5",
      "pregunta6",
      "numero_respuestas_no",
      "resultado",
      "total_si",
    ];

    const escaparCSV = (valor) => {
      if (valor === null || valor === undefined) return "";
      const texto = valor instanceof Date ? valor.toISOString() : String(valor);
      return `"${texto.replace(/"/g, '""')}"`;
    };

    const filas = resultado.rows.map((fila) => columnas.map((col) => escaparCSV(fila[col])).join(","));
    const csv = [columnas.join(","), ...filas].join("\n");

    const fechaArchivo = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reto20s_respuestas_${fechaArchivo}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error("Error al generar CSV:", error.message);
    return res.status(500).json({ ok: false, error: "No se pudo generar el CSV." });
  }
});

// ============================================================
// MANEJO DE RUTAS NO ENCONTRADAS Y ERRORES
// ============================================================
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Ruta no encontrada." });
});

// Manejador de errores genérico: nunca exponer detalles internos al navegador.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Error no controlado:", err);
  res.status(500).json({ ok: false, error: "Error interno del servidor." });
});

// ============================================================
// INICIO DEL SERVIDOR
// ============================================================
inicializarBaseDeDatos()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Reto 20 Seconds escuchando en el puerto ${PORT} (${NODE_ENV})`);
    });
  })
  .catch((error) => {
    console.error("No se pudo inicializar la base de datos:", error.message);
    process.exit(1);
  });
