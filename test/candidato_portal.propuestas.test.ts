/**
 * Propuestas (planes de trabajo) con PDF obligatorio.
 *
 * Una lista no llega a revisión con el programa a medias: necesita al menos una
 * propuesta y cada una debe tener su área, su resumen y un PDF SUBIDO A
 * CODEVOTE (`/api/uploads/planes/*.pdf`).
 *
 * `archivo_url` ya no se acepta en el cuerpo de ninguna petición del portal: la
 * única vía para escribirlo es POST /candidato/listas/:listaId/planes/archivo,
 * que admite solo application/pdf y hasta 10 MB. Un enlace https externo se
 * rechaza: puede cambiar, caducar o pedir permisos que la administración no
 * tiene cuando revisa la lista.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import { readdirSync, rmSync } from 'node:fs';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import portalRoutes from '../src/routes/candidato_portal.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { DIRECTORIO_UPLOADS, SUBRUTA_PLANES, MAX_BYTES_PDF } from '../src/config/uploads.js';
import { estadoVacio, instalarDoble, type Estado } from './_dobleMysql.js';
import path from 'node:path';

const PRESIDENTE = '1710000017'; // responsable de la lista 1
const VOCAL      = '1710000025'; // integrante

const PDF_SUBIDO = '/api/uploads/planes/8a1a82f8-1111-4222-8333-444455556666.pdf';

let estado: Estado;
let restaurar: () => void;

const app = express();
app.use(express.json());
app.use('/api/candidato', portalRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const tokenPresidente = jwt.sign(
  { sub: PRESIDENTE, email: `${PRESIDENTE}@uide.edu.ec`, rol: 'candidato' },
  process.env.JWT_SECRET!
);

/** Lista con presidente y un integrante más, lista para enviarse a revisión. */
function sembrar(): Estado {
  const e = estadoVacio();
  e.procesos   = [{ id_proceso: 1, nombre_proceso: 'Consejo Estudiantil 2026', estado: 'inscripcion' }];
  e.votaciones = [{ id_votacion: 1, titulo_papeleta: 'Consejo', estado: 'pendiente', fk_id_carrera: null, id_proceso: 1 }];
  e.estudiantes = [
    { cedula: PRESIDENTE, nombres: 'María',  apellidos: 'González', rol: 'candidato',  promedio: 92, id_carrera: 1 },
    { cedula: VOCAL,      nombres: 'Carlos', apellidos: 'Pérez',    rol: 'estudiante', promedio: 90, id_carrera: 1 },
  ];
  e.asignaciones = [{ fk_cedula_estudiante: PRESIDENTE, fk_id_votacion: 1, estado: 'activa' }];
  e.listas = [{
    id_lista: 1, nombre_lista: 'Innovación UIDE', estado_revision: 'pendiente',
    fk_cedula_responsable: PRESIDENTE, fk_id_votacion: 1, id_proceso: 1,
    estado_proceso: 'inscripcion', carrera_votacion: null,
  }];
  e.candidatos = [
    { id_candidato: 10, cargo: 'Presidente', fk_cedula_estudiante: PRESIDENTE, fk_id_lista: 1 },
    { id_candidato: 11, cargo: 'Vocal',      fk_cedula_estudiante: VOCAL,      fk_id_lista: 1 },
  ];
  return e;
}

/** Una propuesta completa: área, resumen y PDF subido. */
function propuestaCompleta(id = 1) {
  return {
    id_plan: id, area: 'academico', propuesta: 'Tutorías entre pares',
    archivo_url: PDF_SUBIDO, fk_id_lista: 1,
  };
}

before(async () => {
  await new Promise<void>((resolve) => {
    servidor = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      resolve();
    });
  });
});

after(async () => {
  restaurar?.();
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  await pool.end();
  // Los PDF que la prueba llegó a guardar de verdad.
  for (const archivo of subidosDurantePrueba) {
    rmSync(path.join(DIRECTORIO_UPLOADS, SUBRUTA_PLANES, archivo), { force: true });
  }
});

beforeEach(() => {
  restaurar?.();
  estado = sembrar();
  restaurar = instalarDoble(pool, estado);
});

async function pedir(ruta: string, opciones: { metodo?: string; cuerpo?: any } = {}) {
  const respuesta = await fetch(`${baseUrl}/api/candidato${ruta}`, {
    method: opciones.metodo ?? 'GET',
    headers: {
      Authorization: `Bearer ${tokenPresidente}`,
      ...(opciones.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  return { http: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

const enviarARevision = () => pedir('/listas/1/enviar-revision', { metodo: 'POST' });

// --- Enviar a revisión ------------------------------------------------------

test('una lista sin ninguna propuesta no se envía a revisión: 409', async () => {
  estado.planes = [];

  const { http, cuerpo } = await enviarARevision();

  assert.equal(http, 409);
  assert.match(cuerpo.error, /ninguna propuesta/i);
  assert.equal(estado.listas[0].estado_revision, 'pendiente', 'la lista se envió igualmente');
});

test('una propuesta sin PDF no deja enviar la lista: 409 que la identifica', async () => {
  estado.planes = [
    propuestaCompleta(1),
    { id_plan: 2, area: 'deportivo', propuesta: 'Torneos internos', archivo_url: null, fk_id_lista: 1 },
  ];

  const { http, cuerpo } = await enviarARevision();

  assert.equal(http, 409);
  assert.match(cuerpo.error, /Propuesta 2 \(deportivo\)/, 'el mensaje no identifica la propuesta incompleta');
  assert.match(cuerpo.error, /PDF/);
  assert.ok(!cuerpo.error.includes('Propuesta 1'), 'señala una propuesta que sí está completa');
  assert.equal(estado.listas[0].estado_revision, 'pendiente');
});

test('el 409 enumera TODAS las propuestas incompletas y qué le falta a cada una', async () => {
  estado.planes = [
    { id_plan: 1, area: 'academico', propuesta: '',        archivo_url: PDF_SUBIDO, fk_id_lista: 1 },
    { id_plan: 2, area: 'deportivo', propuesta: 'Torneos', archivo_url: null,       fk_id_lista: 1 },
  ];

  const { http, cuerpo } = await enviarARevision();

  assert.equal(http, 409);
  assert.match(cuerpo.error, /2 propuestas incompletas/);
  assert.match(cuerpo.error, /Propuesta 1 \(academico\): falta el resumen/);
  assert.match(cuerpo.error, /Propuesta 2 \(deportivo\): falta el PDF/);
});

test('un archivo_url que no sea un PDF de CodeVote tampoco vale', async () => {
  // Valores que la base podría arrastrar de antes de la regla.
  for (const valor of ['https://drive.google.com/file/d/abc/view', 'aprobada', '/api/uploads/otros/plan.pdf']) {
    estado.planes = [{ ...propuestaCompleta(1), archivo_url: valor }];

    const { http, cuerpo } = await enviarARevision();

    assert.equal(http, 409, `"${valor}" pasó como PDF válido`);
    assert.match(cuerpo.error, /PDF subido a CodeVote/);
  }
});

test('con todas las propuestas completas la lista sí se envía a revisión', async () => {
  estado.planes = [propuestaCompleta(1), { ...propuestaCompleta(2), area: 'cultural' }];

  const { http } = await enviarARevision();

  assert.equal(http, 200);
  assert.equal(estado.listas[0].estado_revision, 'en_revision');
});

// --- archivo_url no se escribe desde el cuerpo ------------------------------

test('crear una propuesta con URL https externa se rechaza: 422', async () => {
  const { http, cuerpo } = await pedir('/listas/1/planes', {
    metodo: 'POST',
    cuerpo: { area: 'academico', propuesta: 'Tutorías', archivo_url: 'https://drive.google.com/file/d/abc/view' },
  });

  assert.equal(http, 422);
  assert.match(cuerpo.error, /súbelo con POST/i);
  assert.deepEqual(estado.planes, [], 'se creó la propuesta pese al rechazo');
});

test('actualizar una propuesta con URL https externa se rechaza: 422', async () => {
  estado.planes = [propuestaCompleta(1)];

  const { http } = await pedir('/planes/1', {
    metodo: 'PATCH',
    cuerpo: { archivo_url: 'https://ejemplo.com/plan.pdf' },
  });

  assert.equal(http, 422);
  assert.equal(estado.planes[0].archivo_url, PDF_SUBIDO, 'el documento cambió desde el cuerpo');
});

test('una propuesta nace sin documento: el PDF se adjunta después', async () => {
  const { http, cuerpo } = await pedir('/listas/1/planes', {
    metodo: 'POST',
    cuerpo: { area: 'academico', propuesta: 'Tutorías entre pares' },
  });

  assert.equal(http, 201);
  assert.equal(cuerpo.archivo_url, null);
});

// --- Subida del PDF: solo PDF, máximo 10 MB ---------------------------------

const subidosDurantePrueba: string[] = [];

async function subir(contenido: Uint8Array | string, tipo: string, nombre = 'plan.pdf') {
  const formulario = new FormData();
  formulario.append('archivo', new Blob([contenido], { type: tipo }), nombre);

  const respuesta = await fetch(`${baseUrl}/api/candidato/listas/1/planes/archivo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenPresidente}` },
    body: formulario,
  });
  const texto = await respuesta.text();
  return { http: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

test('un archivo que no es PDF se rechaza: 422', async () => {
  estado.planes = [{ ...propuestaCompleta(1), archivo_url: null }];

  const { http, cuerpo } = await subir('no soy un pdf', 'text/plain', 'plan.txt');

  assert.equal(http, 422);
  assert.match(cuerpo.error, /solo se admiten archivos PDF/i);
  assert.equal(estado.planes[0].archivo_url, null, 'se guardó pese al rechazo');
});

test('un PDF de más de 10 MB se rechaza: 422', async () => {
  estado.planes = [{ ...propuestaCompleta(1), archivo_url: null }];

  const { http, cuerpo } = await subir(new Uint8Array(MAX_BYTES_PDF + 1024), 'application/pdf');

  assert.equal(http, 422);
  assert.match(cuerpo.error, /10 MB/);
  assert.equal(estado.planes[0].archivo_url, null);
});

test('un PDF válido se guarda y deja la propuesta completa', async () => {
  estado.planes = [{ ...propuestaCompleta(1), archivo_url: null }];

  const { http, cuerpo } = await subir('%PDF-1.7 contenido de prueba', 'application/pdf');

  assert.equal(http, 201);
  assert.match(cuerpo.archivo_url, /^\/api\/uploads\/planes\/[\w-]+\.pdf$/);
  assert.equal(estado.planes[0].archivo_url, cuerpo.archivo_url);
  subidosDurantePrueba.push(path.basename(cuerpo.archivo_url));

  // Y con eso la lista ya se puede enviar a revisión.
  assert.equal((await enviarARevision()).http, 200);
});

test('el PDF se guarda con un nombre generado, no con el que envía el cliente', async () => {
  estado.planes = [{ ...propuestaCompleta(1), archivo_url: null }];
  const antes = readdirSync(path.join(DIRECTORIO_UPLOADS, SUBRUTA_PLANES));

  const { cuerpo } = await subir('%PDF-1.7', 'application/pdf', '../../../etc/passwd.pdf');

  const nuevos = readdirSync(path.join(DIRECTORIO_UPLOADS, SUBRUTA_PLANES)).filter((f) => !antes.includes(f));
  subidosDurantePrueba.push(...nuevos);
  assert.equal(nuevos.length, 1);
  assert.ok(!nuevos[0].includes('passwd'), 'se respetó el nombre del cliente');
  assert.match(cuerpo.archivo_url, /^\/api\/uploads\/planes\/[\w-]+\.pdf$/);
});
