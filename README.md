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

\`\`\`bash
npm install
\`\`\`

## Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto basándote en el archivo de ejemplo `.env.example`:

\`\`\`env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=codevote_db
JWT_SECRET=tu_secreto_super_seguro
JWT_EXPIRES_IN=1h
\`\`\`

## Scripts de Base de Datos
Ejecuta los siguientes scripts en MySQL (desde MySQL Workbench o la terminal) para preparar la BD:
1. `db/schema.sql` (Crea la base de datos `codevote_db` y las 18 tablas)
2. `db/seed.sql` (Pobla las tablas principales, incluyendo 20 estudiantes de prueba)

## Ejecución
Para arrancar el servidor de desarrollo en el puerto 3000:
\`\`\`bash
npm run dev
\`\`\`

## Cómo obtener el Token JWT (Autenticación)

Para utilizar los endpoints protegidos, primero debes autenticarte:
1. Realiza una petición `POST` a `/api/auth/login`.
2. En el body (formato JSON), envía las credenciales de un estudiante. Ejemplo:
   \`\`\`json
   {
       "correo_institucional": "schininin@uide.edu.ec",
       "password": "password123"
   }
   \`\`\`
   *(Nota: Todos los estudiantes del `seed.sql` tienen la contraseña `password123`)*
3. La API devolverá un objeto JSON que incluye el atributo `"token"`.
4. Copia ese token e inclúyelo en los **Headers** de tus siguientes peticiones:
   `Authorization: Bearer <tu_token_aqui>`

## Tabla de Endpoints

### Autenticación
| Método | Endpoint | Descripción | Acceso |
|--------|----------|-------------|---------|
| POST | `/api/auth/login` | Inicia sesión y devuelve el token JWT | Público |

### Estudiantes (Usuarios)
| Método | Endpoint | Descripción | Acceso |
|--------|----------|-------------|---------|
| GET | `/api/estudiantes` | Lista todos los estudiantes | Admin |
| GET | `/api/estudiantes/:cedula` | Obtiene un estudiante | Estudiante/Admin |
| POST | `/api/estudiantes` | Registra un nuevo estudiante | Admin |
| PATCH | `/api/estudiantes/:cedula` | Actualiza datos de un estudiante | Admin |
| DELETE | `/api/estudiantes/:cedula` | Elimina un estudiante | Admin |

### Procesos Electorales
| Método | Endpoint | Descripción | Acceso |
|--------|----------|-------------|---------|
| GET | `/api/procesos-electorales` | Lista procesos electorales | Estudiante/Admin |
| GET | `/api/procesos-electorales/:id` | Detalle de un proceso | Estudiante/Admin |
| POST | `/api/procesos-electorales` | Crea un nuevo proceso | Admin |
| PATCH | `/api/procesos-electorales/:id` | Edita un proceso | Admin |
| DELETE | `/api/procesos-electorales/:id` | Elimina un proceso | Admin |

### Listas Candidatas
| Método | Endpoint | Descripción | Acceso |
|--------|----------|-------------|---------|
| GET | `/api/listas-candidatas` | Lista todas las listas inscritas | Estudiante/Admin |
| GET | `/api/listas-candidatas/:id` | Detalle de una lista | Estudiante/Admin |
| GET | `/api/listas-candidatas/proceso/:id`| Listas de un proceso específico | Estudiante/Admin |
| POST | `/api/listas-candidatas` | Inscribe una nueva lista | Admin |
| PATCH | `/api/listas-candidatas/:id` | Edita una lista | Admin |
| DELETE | `/api/listas-candidatas/:id` | Elimina una lista | Admin |

### Votos
| Método | Endpoint | Descripción | Acceso |
|--------|----------|-------------|---------|
| POST | `/api/votos` | Emite un nuevo voto (Válido, Blanco, Nulo) | Estudiante |
| GET | `/api/votos/resultados/:id` | Ver escrutinio/resultados de votación | Estudiante/Admin |
