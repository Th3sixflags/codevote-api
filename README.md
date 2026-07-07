# CodeVote API

API REST para el sistema de votaciones universitarias CodeVote. 
Implementada con Node.js, TypeScript, Express 5 y MySQL.

## Estructura de la Base de Datos

El proyecto utiliza un modelo Entidad-Relación de **18 tablas**:
- `facultad`, `director`, `carrera`, `estudiante`
- `responsable`, `cronograma`, `proceso_electoral`, `votacion`
- `lista_candidata`, `candidato`, `requisito`, `validacion_requisito`, `plan_trabajo`
- `voto`, `codigo_voto`, `acta_resultados`
- `veedor`, `veeduria`

## Endpoints de la API

La API expone endpoints para las **4 entidades principales** del núcleo de votaciones:

- `POST /api/auth/login` (Usa tabla `estudiante` con `correo_institucional` y `password`)
- `/api/estudiantes` (CRUD)
- `/api/procesos-electorales` (CRUD)
- `/api/listas-candidatas` (CRUD)
- `/api/votos` (Emitir voto y Ver Resultados)

## Requisitos
- Node.js 20+
- MySQL 8.x

## Instalación

\`\`\`bash
npm install
\`\`\`

## Base de Datos
Ejecuta los siguientes scripts en MySQL:
1. `db/schema.sql` (Crea las 18 tablas)
2. `db/seed.sql` (Pobla las tablas con datos de prueba)

## Variables de Entorno
Crea un archivo `.env` basado en `.env.example`.

## Ejecución
\`\`\`bash
npm run dev
\`\`\`
