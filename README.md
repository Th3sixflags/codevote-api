# CodeVote API

API REST para el sistema de votaciones universitarias CodeVote. 
Implementada con Node.js, TypeScript, Express 5 y MySQL bajo una arquitectura de 3 capas.

## Decisiones de Diseño

1. **Arquitectura de 3 Capas**: Se implementó una clara separación de responsabilidades:
   - **Controllers**: Parseo de peticiones HTTP, validación con Zod y envío de respuestas.
   - **Services**: Contienen la lógica de negocio central.
   - **Repositories**: Única capa con acceso directo a la base de datos mediante queries SQL con `mysql2`.
2. **Validación Robusta**: Se optó por usar `Zod` para validar la estructura y tipos de datos de entrada (body) antes de tocar la lógica de negocio, devolviendo errores `422` descriptivos.
3. **Seguridad**:
   - Autenticación mediante **JWT** (JSON Web Tokens).
   - Encriptación de contraseñas de usuarios en la base de datos usando **Bcrypt**.
   - Middlewares personalizados para validación de roles (`requireAuth`, `requireAdmin`).
   - `express-rate-limit` global para prevenir ataques de fuerza bruta (máximo 100 peticiones cada 15 min).
4. **Base de Datos (18 Tablas)**: Para reflejar fielmente la complejidad de un sistema de votaciones universitarias, el modelo EER incluye 18 tablas (estudiantes, carreras, facultades, procesos, actas, veedurías, etc.).
5. **Enfoque de la API**: Para esta Fase 1, la API expone endpoints exclusivamente para las **4 entidades core** (Estudiantes, Procesos Electorales, Listas Candidatas y Votos).

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
1. Realiza una petición `POST` a `/api/auth/login`.
2. En el body (formato JSON), envía las credenciales de un estudiante. Ejemplo:
   ```json
   {
       "correo_institucional": "schininin@uide.edu.ec",
       "password": "password123"
   }
   ```
   *(Nota: Todos los estudiantes del `seed.sql` tienen la contraseña `password123`)*
3. La API devolverá un objeto JSON que incluye el atributo `"token"`.
4. Copia ese token e inclúyelo en los **Headers** de tus siguientes peticiones:
   `Authorization: Bearer <tu_token_aqui>`

## Tabla de Endpoints

La API expone **94 endpoints** (+ `/health`) sobre las 18 tablas del modelo.
La especificación completa está en [`openapi.yaml`](./openapi.yaml).

Convenciones:
- Todos requieren `Authorization: Bearer <token>` salvo `/api/auth/login` y `/health`.
- `POST`, `PATCH` y `DELETE` requieren rol **admin**.
- Cada recurso expone: `GET /` · `GET /:id` · `POST /` · `PATCH /:id` · `DELETE /:id`

### Autenticación y sistema
| Método | Endpoint | Acceso |
|--------|----------|--------|
| POST | `/api/auth/login` | Público |
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
| Listas candidatas | `/api/listas-candidatas` | `GET /proceso/:procesoId` |
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

Todos los usuarios del seed usan la contraseña **`password123`**.

| Correo | Rol |
|--------|-----|
| `schininin@uide.edu.ec` | admin |
| `mgonzalez@uide.edu.ec` | estudiante |

> Son credenciales de demostración presentes en el repositorio: no deben usarse
> como cuentas reales ni considerarse seguras.

## 5. Endpoints que consume el frontend

| Método | Endpoint | Auth |
|--------|----------|------|
| POST | `/api/auth/login` | Público |
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
