# CodeVote API — Plataforma de Votaciones Institucionales

API REST para el sistema de votaciones institucionales CodeVote. 
Implementada con Node.js, TypeScript, Express 5 y MySQL bajo una arquitectura de 3 capas.

## Decisiones de Diseño

1. **Arquitectura de 3 Capas**: Se implementó una clara separación de responsabilidades:
   - **Controllers**: Parseo de peticiones HTTP, validación con Zod y envío de respuestas.
   - **Services**: Contienen la lógica de negocio central.
   - **Repositories**: Única capa con acceso directo a la base de datos mediante queries SQL con `mysql2`.
2. **Validación Robusta**: Se optó por usar `Zod` para validar la estructura y tipos de datos de entrada (body) antes de tocar la lógica de negocio, devolviendo errores `422` descriptivos.
3. **Seguridad**:
   - Autenticación mediante **JWT** (JSON Web Tokens).
   - Acceso sin contraseña mediante códigos de un solo uso enviados al correo institucional.
   - Middlewares personalizados para validación de roles (`requireAuth`, `requireAdmin`).
   - `express-rate-limit` global para prevenir ataques de fuerza bruta (máximo 100 peticiones cada 15 min).
4. **Base de Datos (18 Tablas)**: Para reflejar fielmente la complejidad de un sistema de votaciones universitarias, el modelo EER incluye 18 tablas (estudiantes, carreras, facultades, procesos, actas, veedurías, etc.).
5. **Enfoque de la API**: Para esta Fase 1, la API expone endpoints exclusivamente para las **4 entidades core** (Estudiantes, Procesos Electorales, Listas Candidatas y Votos).

## Servidor MCP

El proyecto incluye un **servidor MCP (Model Context Protocol)** en [`mcp/`](mcp/)
que permite a un asistente de IA (Claude Desktop, Claude Code) consultar el
proceso electoral: procesos, papeletas, candidaturas, escrutinio, actas y
veeduría.

Habla con esta API por HTTPS con JWT —no con MySQL directamente—, así que hereda
su control de acceso. Expone 15 herramientas de consulta y 8 de administración
frente a las 71 rutas de la API, y tres operaciones están bloqueadas de forma
absoluta: **emitir un voto**, **borrar cualquier registro** y **tocar
credenciales**.

- Instalación y uso: [`mcp/README.md`](mcp/README.md)
- Análisis de transporte, capacidades y hardening: [`mcp/docs/TA-3.2-analisis.md`](mcp/docs/TA-3.2-analisis.md)

```bash
cd mcp && npm install && npm run build
```

## Estructura de la Base de Datos

El proyecto utiliza un modelo Entidad-Relación de 18 tablas:
- `facultad`, `director`, `carrera`, `estudiante`
- `responsable`, `cronograma`, `proceso_electoral`, `votacion`
- `lista_candidata`, `candidato`, `requisito`, `validacion_requisito`, `plan_trabajo`
- `voto`, `codigo_voto`, `acta_resultados`
- `veedor`, `veeduria`

## Requisitos
- Node.js 20+
- MySQL 8.x

## Instalación

```bash
npm install
```

## Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto basándote en el archivo de ejemplo `.env.example`:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=codevote_db
JWT_SECRET=tu_secreto_super_seguro
JWT_EXPIRES_IN=1h
```

## Scripts de Base de Datos
Ejecuta los siguientes scripts en MySQL (desde MySQL Workbench o la terminal) para preparar la BD:
1. `db/schema.sql` (Crea la base de datos `codevote_db` y las 18 tablas)
2. `db/seed.sql` (Pobla las tablas principales, incluyendo 20 estudiantes de prueba)

## Ejecución
Para arrancar el servidor de desarrollo en el puerto 3000:
```bash
npm run dev
```

## Cómo obtener el Token JWT (Autenticación)

Para utilizar los endpoints protegidos, primero debes autenticarte:
1. Solicita un código con `POST /api/auth/codigo` usando el correo UIDE o la cédula:
   ```json
   {
       "identificador": "stchinininca@uide.edu.ec"
   }
   ```
   Si una cédula pertenece a más de una institución, la API responde `409` con
   los slugs públicos disponibles. Repite la solicitud incluyendo, por ejemplo,
   `"institucion_slug": "institucion-b"`; el mismo campo debe enviarse al
   canjear el código. Un correo que sea único no necesita selector.
2. Canjea el código recibido con `POST /api/auth/verificar` enviando el mismo
   identificador y el código de 6 dígitos.
3. La API devolverá un objeto JSON que incluye el atributo `"token"`.
4. Incluye ese token en los **Headers** de las siguientes peticiones:
   `Authorization: Bearer <tu_token_aqui>`

## Tabla de Endpoints

La API expone **94 endpoints** (+ `/health`) sobre las 18 tablas del modelo.
La especificación completa está en [`openapi.yaml`](./openapi.yaml).

Convenciones:
- Todos requieren `Authorization: Bearer <token>` salvo `/api/auth/codigo`, `/api/auth/verificar` y `/health`.
- `POST`, `PATCH` y `DELETE` requieren rol **admin**.
- Cada recurso expone: `GET /` · `GET /:id` · `POST /` · `PATCH /:id` · `DELETE /:id`

### Autenticación y sistema
| Método | Endpoint | Acceso |
|--------|----------|--------|
| POST | `/api/auth/codigo` | Público |
| POST | `/api/auth/verificar` | Público |
| GET | `/health` | Público |

### Catálogos institucionales
| Recurso | Ruta base | Lectura |
|---------|-----------|---------|
| Facultades | `/api/facultades` | Autenticado |
| Directores | `/api/directores` | Autenticado |
| Carreras | `/api/carreras` | Autenticado |
| Responsables | `/api/responsables` | Autenticado |
| Estudiantes | `/api/estudiantes` | Admin (listado) |

### Proceso electoral
| Recurso | Ruta base | Subrutas |
|---------|-----------|----------|
| Procesos electorales | `/api/procesos-electorales` | — |
| Cronogramas | `/api/cronogramas` | `GET /proceso/:procesoId` |
| Votaciones *(solo lectura)* | `/api/votaciones` | `GET /proceso/:procesoId` |

### Candidaturas
| Recurso | Ruta base | Subrutas |
|---------|-----------|----------|
| Listas candidatas | `/api/listas-candidatas` | `GET /proceso/:procesoId` · `PATCH /:id/responsable` **(solo admin)** |
| Candidatos | `/api/candidatos` | `GET /lista/:listaId` |
| Planes de trabajo | `/api/planes-trabajo` | `GET /lista/:listaId` |
| Requisitos | `/api/requisitos` | — |
| Validaciones de requisito | `/api/validaciones-requisito` | `GET /candidato/:candidatoId` |

### Votación y resultados
| Recurso | Ruta base | Notas |
|---------|-----------|-------|
| Votos | `/api/votos` | `POST /` emitir · `GET /resultados/:votacionId` escrutinio |
| Códigos de voto | `/api/codigos-voto` | **Solo admin** · `GET /votacion/:votacionId` |
| Actas de resultados | `/api/actas-resultados` | `GET /votacion/:votacionId` |

### Veeduría
| Recurso | Ruta base | Subrutas |
|---------|-----------|----------|
| Veedores | `/api/veedores` | — |
| Veedurías | `/api/veedurias` | `GET /votacion/:votacionId` |

---

## Responsable de la candidatura

Solo el **responsable** de una lista tiene `rol = 'candidato'` y acceso al Portal
del candidato (`/api/candidato/*`). Es, además, su **Presidente**.

- `POST /api/candidato/listas` registra automáticamente al responsable en
  `lista_candidata.fk_cedula_responsable` y lo inserta como integrante con cargo
  `Presidente`, todo en una transacción.
- Los demás integrantes (vicepresidente, secretario, tesorero, vocales) solo
  obtienen una fila en la tabla `candidato`: **conservan `rol = 'estudiante'`**,
  no reciben `asignacion_candidatura` ni acceso al portal.
- Cada endpoint de escritura del portal comprueba
  `req.user.sub === lista_candidata.fk_cedula_responsable` y responde `403` en
  caso contrario, aunque quien llame conozca el ID de la lista.
- Una lista no puede tener dos presidentes (`409`, reforzado con un índice único
  en la base) ni eliminar a su responsable desde el portal (`409`).
- Ningún integrante puede votar en la papeleta donde compite (`403`), tenga rol
  `candidato` o `estudiante`. En otra papeleta habilitada sí puede votar.
- Cambiar de presidente es exclusivo de la administración:
  `PATCH /api/listas-candidatas/:id/responsable` con
  `{ "cedula_nuevo_responsable": "1100000000" }`. La operación es transaccional:
  el nuevo responsable pasa a `candidato`, recibe la asignación y queda como
  `Presidente`; el anterior pierde su asignación y vuelve a `estudiante` si no
  administra otra candidatura.

Los cargos viajan capitalizados (`Presidente`, `Vicepresidente`, `Secretario`,
`Tesorero`, `Vocal`). Se sigue aceptando la grafía antigua en minúsculas, que se
normaliza automáticamente.

Migración: `db/migrations/2026-08-01_responsable_presidente.sql` (idempotente).

---

# Despliegue e Integración con el Frontend

## Requisitos del servidor
- **Node.js 20+**
- **MySQL 8.x**
- Puerto **3000** abierto (o el que se defina en `PORT`)

## 1. Preparar la base de datos

```bash
mysql -u <usuario> -p < db/schema.sql
mysql -u <usuario> -p codevote_db < db/seed.sql
```

`schema.sql` crea la BD y las 18 tablas (incluida la columna `rol` de `estudiante`).
`seed.sql` carga los datos de prueba y marca al administrador.

> Ambos archivos ejecutan `SET NAMES utf8mb4` para que las tildes y la ñ se guarden
> correctamente sin depender del charset por defecto del cliente MySQL.

### Migraciones sobre una base que ya está en uso

`schema.sql` es para una base nueva: **no** se ejecuta sobre una base con datos.
Para actualizar una existente se aplican los scripts de `db/migrations/` en orden
de fecha. Son idempotentes, así que volver a correr uno ya aplicado no hace nada.

Antes de aplicar cualquiera, respaldar:

```bash
mysqldump -u <usuario> -p --single-transaction --routines codevote_db > respaldo_$(date +%F_%H%M).sql
```

Aplicar la migración:

```bash
mysql -u <usuario> -p codevote_db < db/migrations/2026-08-01_responsable_presidente.sql
```

Para permitir que una misma persona pertenezca a varias instituciones, aplicar
también `db/migrations/2026-08-14_membresias_multinstitucion.sql`. La migración
crea `estudiante_institucion`, importa las membresías actuales y conserva
`estudiante` como identidad canónica; no se deben borrar ni duplicar las filas
históricas.

La base se indica en la línea de comandos: el script no fija ninguna con `USE`.
MySQL hace `COMMIT` implícito en cada sentencia DDL, así que la migración **no
es** una transacción única; si falla a mitad, se restaura el respaldo.

Comprobar que quedó bien:

```bash
mysql -u <usuario> -p codevote_db -e "
  SELECT l.id_lista, l.fk_cedula_responsable, c.cargo
    FROM lista_candidata l
    LEFT JOIN candidato c
      ON c.fk_id_lista = l.id_lista
     AND c.fk_cedula_estudiante = l.fk_cedula_responsable;
  SELECT cedula, rol FROM estudiante WHERE rol = 'candidato';"
```

Cada lista con responsable debe mostrarlo con cargo `Presidente`, y los únicos
`rol = 'candidato'` deben ser esos responsables.

## 2. Variables de entorno

Copiar `.env.example` a `.env` y completar:

```env
PORT=3000
HOST=0.0.0.0
DB_HOST=localhost
DB_PORT=3306
DB_USER=<usuario>
DB_PASSWORD=<contraseña>
DB_NAME=codevote_db
JWT_SECRET=<cadena larga y única de este entorno>
JWT_EXPIRES_IN=1h
CORS_ORIGIN=https://codevote.lat
```

- **`HOST=0.0.0.0`** hace que el servidor sea accesible desde fuera del host/contenedor.
- **`CORS_ORIGIN`** acepta varios orígenes separados por coma. Si se deja vacío se
  permite cualquier origen (**solo para pruebas**, no usar en producción).

## 3. Ejecutar

```bash
npm ci
npm run build
npm start
```

Comprobar que responde:

```bash
curl http://localhost:3000/health     # {"status":"ok"}
```

### Con Docker

```bash
docker build -t codevote-api .
docker run -d -p 3000:3000 --env-file .env codevote-api
```

## 4. Usuarios de prueba

Todos los usuarios acceden solicitando un código a su correo institucional; no
hay contraseñas de demostración.

| Correo | Rol | Notas |
|--------|-----|-------|
| `schininin@uide.edu.ec` | admin | — |
| `mgonzalez@uide.edu.ec` | candidato | Responsable/Presidenta de «Innovación UIDE» |
| `smendoza@uide.edu.ec` | candidato | Responsable/Presidenta de «Unidad Estudiantil» |
| `cperez@uide.edu.ec` | estudiante | Integrante de una lista: **no** entra al portal |

> Son cuentas de demostración. El código solo se entrega al buzón institucional
> vinculado a cada una.

## 5. Endpoints que consume el frontend

| Método | Endpoint | Auth |
|--------|----------|------|
| POST | `/api/auth/codigo` | Público |
| POST | `/api/auth/verificar` | Público |
| GET | `/api/procesos-electorales` | Token |
| GET | `/api/procesos-electorales/:id` | Token |
| GET | `/api/listas-candidatas/proceso/:id` | Token |
| GET | `/api/votaciones/proceso/:id` | Token |
| POST | `/api/votos` | Token |
| GET | `/api/votos/resultados/:id` | Token |

Formato de respuesta del login:

```json
{
  "token": "<jwt>",
  "usuario": { "cedula": "...", "nombres": "...", "apellidos": "...", "rol": "estudiante|admin" }
}
```

El token se envía en las peticiones protegidas como `Authorization: Bearer <token>`.

## 6. Nota importante para el frontend

El frontend usa un **proxy de Vite que solo existe en desarrollo**. Al compilarlo para
producción hay que indicarle la URL del backend, o las llamadas a `/api` fallarán:

```bash
VITE_API_URL=https://<dominio-del-backend>/api npm run build
```

> Si el frontend se sirve por **HTTPS** (`https://codevote.lat`) y el backend por HTTP,
> el navegador bloqueará las peticiones por *mixed content*. Lo recomendable es exponer
> el backend bajo el mismo dominio (por ejemplo `https://codevote.lat/api` con un
> reverse proxy) o darle su propio certificado.
