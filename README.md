# Reto 20 Seconds — Salud UNAM

Cuestionario de salud institucional, anónimo, con backend en Node.js + Express y
almacenamiento en PostgreSQL. Incluye panel de administrador protegido con
gráficas, tabla de respuestas y descarga en CSV.

```
reto-20-seconds/
├── index.html          Cuestionario del alumno
├── admin.html           Panel de administrador (login + dashboard)
├── server.js             Servidor Express + API + conexión a PostgreSQL
├── package.json
├── .gitignore
├── .env.example          Plantilla de variables de entorno para desarrollo local
├── README.md
└── public/
    ├── css/style.css      Estilos del cuestionario
    ├── css/admin.css      Estilos del panel de administrador
    ├── js/app.js           Lógica del cuestionario (envío al backend)
    ├── js/admin.js         Lógica del panel de administrador
    └── img/                Logos institucionales
```

---

## 1. Requisitos previos

- [Node.js](https://nodejs.org) 18 o superior.
- Una base de datos PostgreSQL (local para pruebas, o en la nube para producción).
- Una cuenta de [GitHub](https://github.com) y una de [Render](https://render.com).

---

## 2. Instalación local

Dentro de la carpeta del proyecto:

```bash
npm install
```

---

## 3. Configurar variables de entorno para pruebas locales

1. Copia el archivo de ejemplo:

   ```bash
   cp .env.example .env
   ```

2. Abre `.env` y completa:

   - `DATABASE_URL`: cadena de conexión a tu PostgreSQL local, por ejemplo:
     `postgresql://postgres:tu_password@localhost:5432/reto20s`
   - `ADMIN_PASSWORD`: la contraseña que usarás para entrar a `/admin`.
   - `PORT`: puerto local, por ejemplo `3000` (opcional).
   - `NODE_ENV`: `development` para pruebas locales.

   El archivo `.env` **nunca** se sube a GitHub (ya está en `.gitignore`).

---

## 4. Ejecutar en local

```bash
npm install
npm start
```

El servidor imprime en consola algo como:

```
Tabla 'respuestas' verificada/creada correctamente.
Reto 20 Seconds escuchando en el puerto 3000 (development)
```

- Cuestionario del alumno: `http://localhost:3000/`
- Panel de administrador: `http://localhost:3000/admin`

La tabla `respuestas` se crea automáticamente la primera vez que arranca el
servidor (no necesitas ejecutar ningún script SQL manual).

---

## 5. Variables de entorno que necesita el proyecto

| Variable         | Obligatoria | Descripción                                                                 |
|-------------------|:-----------:|-------------------------------------------------------------------------------|
| `DATABASE_URL`    | Sí          | Cadena de conexión completa a PostgreSQL.                                     |
| `ADMIN_PASSWORD`  | Sí          | Contraseña del panel de administrador. Elige una contraseña fuerte.            |
| `PORT`            | No          | Puerto del servidor. Render lo define automáticamente en producción.          |
| `NODE_ENV`        | No          | Usa `production` en Render (activa cookies `Secure` y SSL hacia PostgreSQL).   |
| `SESSION_SECRET`  | No          | Secreto para firmar la cookie de sesión del admin. Si no lo defines, se genera uno derivado de `ADMIN_PASSWORD`. Se recomienda definirlo aparte en producción. |

Ninguna de estas variables está escrita dentro del código ni de los archivos
HTML. El servidor las lee exclusivamente de `process.env`.

---

## 6. Subir el proyecto a GitHub

```bash
git init
git add .
git commit -m "Reto 20 Seconds: cuestionario + panel admin con PostgreSQL"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/reto-20-seconds.git
git push -u origin main
```

Verifica que `.env` **no** aparezca en `git status` antes de hacer commit
(gracias a `.gitignore`, no debería aparecer).

---

## 7. Crear el Web Service en Render

1. Entra a [render.com](https://render.com) y crea una cuenta o inicia sesión.
2. Clic en **New +** → **Web Service**.
3. Conecta tu repositorio de GitHub `reto-20-seconds`.
4. Configura:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. No hagas clic en "Create" todavía: primero configura la base de datos y
   las variables de entorno (siguientes pasos).

---

## 8. Crear y conectar la base de datos PostgreSQL en Render

1. En el dashboard de Render, clic en **New +** → **PostgreSQL**.
2. Ponle un nombre (por ejemplo `reto20s-db`) y crea la base de datos.
3. Cuando esté lista, copia el valor de **Internal Database URL** (si tu Web
   Service y tu base de datos están en la misma cuenta/región de Render) o
   **External Database URL** si te conectas desde fuera de Render.
4. Ve a tu **Web Service** → pestaña **Environment** → **Add Environment Variable**:
   - `DATABASE_URL` = (pega la URL que copiaste)

---

## 9. Configurar `ADMIN_PASSWORD` y `NODE_ENV` en Render

En la misma pestaña **Environment** de tu Web Service, agrega también:

- `ADMIN_PASSWORD` = la contraseña que usarás para entrar al panel `/admin`
  (elige algo fuerte y solo compártela contigo o con quien administre el
  cuestionario).
- `NODE_ENV` = `production`
- (Opcional pero recomendado) `SESSION_SECRET` = una cadena larga y aleatoria
  distinta de tu contraseña de administrador.

Guarda los cambios. Render volverá a desplegar automáticamente con las
nuevas variables.

---

## 10. Acceder al cuestionario (alumnos)

Una vez desplegado, comparte con los alumnos:

```
https://TU-APP.onrender.com/
```

Cada vez que un alumno completa el cuestionario y presiona **FINALIZAR**, la
respuesta se envía al servidor y se guarda directamente en PostgreSQL. Si no
hay conexión o el servidor falla, la app lo indica claramente y ofrece un
botón **Reintentar envío** — nunca informa al alumno que su respuesta fue
guardada si el servidor no lo confirmó.

---

## 11. Acceder al panel de administrador (tú, desde tu tablet)

Abre en tu tablet o computadora:

```
https://TU-APP.onrender.com/admin
```

Ingresa la contraseña que configuraste en `ADMIN_PASSWORD`. Verás:

- Total de respuestas, número de hombres y mujeres.
- Número de estudiantes en alerta (resultado "rojo").
- Gráfica de barras con el porcentaje de "Sí" por pregunta (6 preguntas), separado por sexo.
- Resumen del semáforo: número y porcentaje de participantes en verde, amarillo y rojo,
  con una gráfica de dona de 3 colores.
- Tabla con todas las respuestas individuales (más recientes primero), incluyendo las
  6 preguntas y el resultado del semáforo.
- Botón **Actualizar** para refrescar los datos sin recargar la página.
- Botón **Descargar CSV** para exportar todos los registros.
- Botón **Salir** para cerrar la sesión de administrador.

La sesión de administrador dura 8 horas y se guarda en una cookie firmada,
`httpOnly` y `Secure` en producción — nunca en `localStorage` ni en el código
del cliente.

---

## 12. Descargar el CSV

Desde el panel de administrador, clic en **Descargar CSV**. El navegador
descarga un archivo `reto20s_respuestas_AAAA-MM-DD.csv` con todos los
registros almacenados en PostgreSQL (id, fecha/hora, sexo, las 6 preguntas,
número de respuestas "NO", resultado del semáforo y total de "Sí").

---

## 13. Comprobar que las respuestas están entrando correctamente

1. Abre el cuestionario (`/`) en un navegador o desde tu celular, respóndelo
   y presiona **FINALIZAR**. Debes ver una de las tres pantallas de resultado
   (roja, amarilla o verde, según el número de respuestas "NO") con el texto
   discreto **"✓ Respuesta registrada"**.
2. Abre el panel de administrador (`/admin`) e ingresa tu contraseña.
3. Clic en **Actualizar**: el total de respuestas y la tabla deben reflejar
   el registro que acabas de enviar.
4. También puedes verificar que el servidor esté vivo visitando:
   `https://TU-APP.onrender.com/health` (debe responder `{"ok":true,...}`).

Si un envío falla (por ejemplo, por mala conexión del alumno), la app
muestra un aviso de error y un botón para reintentar; ese registro **no**
aparecerá en el panel hasta que el envío se complete con éxito.

---

## Notas sobre privacidad

El cuestionario es completamente anónimo. El servidor **no** solicita ni
almacena nombre, correo, número de cuenta, teléfono, ubicación GPS,
identificadores del dispositivo, ni la dirección IP como dato del estudio.
Únicamente se guarda: sexo asignado al nacer, las 5 respuestas del
cuestionario, el resultado calculado y la fecha/hora generada por el
servidor.

## Notas sobre seguridad

- Las contraseñas y la cadena de conexión a PostgreSQL viven únicamente en
  variables de entorno (`process.env`), nunca en el código ni en el HTML.
- La comparación de la contraseña de administrador usa `crypto.timingSafeEqual`
  para evitar ataques de temporización.
- Los endpoints `/api/admin/*` (resumen, respuestas, csv) exigen una cookie
  de sesión válida; sin ella responden `401`, incluso si alguien adivina la
  URL directamente.
- El intento de login de administrador está limitado a 10 solicitudes cada
  15 minutos por dirección IP.
- Todas las consultas a PostgreSQL usan parámetros (`$1`, `$2`, …), nunca
  concatenación de strings, para evitar inyección SQL.
- El tamaño del cuerpo de las solicitudes JSON está limitado a 15 KB.
- Los errores internos del servidor y de PostgreSQL nunca se envían al
  navegador; solo se registran en los logs del servidor.
- Se usa `helmet` para cabeceras de seguridad HTTP razonables por defecto.
