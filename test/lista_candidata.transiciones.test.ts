/**
 * Transiciones del estado de revisión de una lista y avisos al responsable.
 *
 *   pendiente ──(el candidato envía)──> en_revision ──> aprobada | rechazada
 *   aprobada  ──(la administración retira)──────────> retirada
 *
 * Antes cada acción escribía el estado sin mirar el anterior: se podía aprobar
 * un borrador que nunca se envió a revisión, o reactivar una lista retirada.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import listaRoutes from '../src/routes/lista_candidata.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { estadoVacio, instalarDoble, type Estado } from './_dobleMysql.js';

const RESPONSABLE = '1710000017';

let estado: Estado;
let restaurar: () => void;

const app = express();
app.use(express.json());
app.use('/api/listas-candidatas', listaRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const tokenAdmin = jwt.sign(
  { sub: '1710000009', email: 'schininin@uide.edu.ec', rol: 'admin' },
  process.env.JWT_SECRET!
);

function sembrar(estadoRevision: string): Estado {
  const e = estadoVacio();
  e.procesos = [{ id_proceso: 1, nombre_proceso: 'Consejo Estudiantil 2026', estado: 'inscripcion' }];
  e.votaciones = [{ id_votacion: 1, titulo_papeleta: 'Consejo', estado: 'pendiente', fk_id_carrera: null, id_proceso: 1 }];
  e.estudiantes = [
    { cedula: RESPONSABLE, nombres: 'María', apellidos: 'González', rol: 'candidato', promedio: 92, id_carrera: 1 },
  ];
  e.listas = [{
    id_lista: 1, nombre_lista: 'Innovación UIDE', estado_revision: estadoRevision,
    fk_cedula_responsable: RESPONSABLE, fk_id_votacion: 1, id_proceso: 1,
    estado_proceso: 'inscripcion', carrera_votacion: null,
  }];
  // Programa completo: aprobar exige que toda propuesta tenga área, resumen y
  // su PDF subido a CodeVote.
  e.planes = [{
    id_plan: 1, area: 'academico', propuesta: 'Tutorías entre pares',
    archivo_url: '/api/uploads/planes/8a1a82f8-1111-4222-8333-444455556666.pdf',
    fk_id_lista: 1,
  }];
  return e;
}

async function accion(ruta: string, cuerpo?: object) {
  const respuesta = await fetch(`${baseUrl}/api/listas-candidatas/1/${ruta}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo ?? {}),
  });
  const texto = await respuesta.text();
  return { http: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

function preparar(estadoRevision: string) {
  restaurar?.();
  estado = sembrar(estadoRevision);
  restaurar = instalarDoble(pool, estado);
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
});

beforeEach(() => preparar('en_revision'));

// --- Transiciones válidas ---------------------------------------------------

test('una lista en revisión se puede aprobar', async () => {
  const { http } = await accion('aprobar');
  assert.equal(http, 200);
  assert.equal(estado.listas[0].estado_revision, 'aprobada');
});

test('no se aprueba una lista con una propuesta sin PDF: 409', async () => {
  // La lista sigue siendo editable mientras está en revisión, así que se puede
  // colar una propuesta vacía después de enviarla. Una lista APROBADA nunca
  // debe contener propuestas sin PDF.
  estado.planes.push({ id_plan: 2, area: 'deportivo', propuesta: 'Torneos', archivo_url: null, fk_id_lista: 1 });

  const { http, cuerpo } = await accion('aprobar');

  assert.equal(http, 409);
  assert.match(cuerpo.error, /Propuesta 2 \(deportivo\)/);
  assert.match(cuerpo.error, /PDF/);
  assert.equal(estado.listas[0].estado_revision, 'en_revision', 'la lista se aprobó igualmente');
});

test('no se aprueba una lista sin ninguna propuesta: 409', async () => {
  estado.planes = [];

  const { http, cuerpo } = await accion('aprobar');

  assert.equal(http, 409);
  assert.match(cuerpo.error, /ninguna propuesta/i);
  assert.equal(estado.listas[0].estado_revision, 'en_revision');
});

test('rechazar y retirar no exigen el programa completo', async () => {
  // Rechazar una lista incompleta es justamente lo que debe poder hacer el admin.
  estado.planes = [];
  assert.equal((await accion('rechazar', { motivo: 'Programa incompleto.' })).http, 200);

  preparar('aprobada');
  estado.planes = [];
  assert.equal((await accion('retirar')).http, 200);
});

test('una lista en revisión se puede rechazar con motivo', async () => {
  const { http } = await accion('rechazar', { motivo: 'Falta el plan de trabajo.' });
  assert.equal(http, 200);
  assert.equal(estado.listas[0].estado_revision, 'rechazada');
  assert.equal(estado.listas[0].motivo_rechazo, 'Falta el plan de trabajo.');
});

test('una lista aprobada se puede retirar', async () => {
  preparar('aprobada');
  const { http } = await accion('retirar');
  assert.equal(http, 200);
  assert.equal(estado.listas[0].estado_revision, 'retirada');
});

// --- Transiciones inválidas: 409 --------------------------------------------

test('una lista pendiente NO se puede aprobar directamente: 409', async () => {
  preparar('pendiente');
  const { http, cuerpo } = await accion('aprobar');
  assert.equal(http, 409);
  assert.match(cuerpo.error, /en revisión/i);
  assert.equal(estado.listas[0].estado_revision, 'pendiente', 'el estado no debe cambiar');
});

test('una lista pendiente NO se puede rechazar directamente: 409', async () => {
  preparar('pendiente');
  const { http } = await accion('rechazar', { motivo: 'Cualquiera' });
  assert.equal(http, 409);
  assert.equal(estado.listas[0].estado_revision, 'pendiente');
});

test('una lista retirada no se reactiva aprobándola: 409', async () => {
  preparar('retirada');
  const { http, cuerpo } = await accion('aprobar');
  assert.equal(http, 409);
  assert.match(cuerpo.error, /retirada/i);
  assert.equal(estado.listas[0].estado_revision, 'retirada');
});

test('una lista rechazada no se aprueba sin volver a revisión: 409', async () => {
  preparar('rechazada');
  const { http } = await accion('aprobar');
  assert.equal(http, 409);
  assert.equal(estado.listas[0].estado_revision, 'rechazada');
});

test('una lista pendiente no se puede retirar: 409', async () => {
  preparar('pendiente');
  const { http } = await accion('retirar');
  assert.equal(http, 409);
  assert.equal(estado.listas[0].estado_revision, 'pendiente');
});

// --- Avisos al responsable --------------------------------------------------

test('al aprobar se avisa al responsable', async () => {
  await accion('aprobar');
  assert.equal(estado.notificaciones.length, 1);
  const aviso = estado.notificaciones[0];
  assert.equal(aviso.cedula, RESPONSABLE);
  assert.equal(aviso.titulo, 'Lista aprobada');
  assert.match(aviso.mensaje, /Innovación UIDE/);
});

test('al rechazar el aviso incluye el motivo', async () => {
  await accion('rechazar', { motivo: 'El plan de trabajo está incompleto.' });
  assert.equal(estado.notificaciones.length, 1);
  assert.equal(estado.notificaciones[0].titulo, 'Lista rechazada');
  assert.match(estado.notificaciones[0].mensaje, /El plan de trabajo está incompleto\./);
});

test('repetir la petición no duplica el aviso', async () => {
  const primera = await accion('aprobar');
  const segunda = await accion('aprobar');

  assert.equal(primera.http, 200);
  assert.equal(segunda.http, 409, 'la segunda ya no parte de en_revision');
  assert.equal(estado.notificaciones.length, 1, 'solo debe haber un aviso');
});

test('una transición rechazada no genera ningún aviso', async () => {
  preparar('pendiente');
  await accion('aprobar');
  assert.equal(estado.notificaciones.length, 0);
});

test('el mensaje de rechazo no supera el límite de la columna (255)', async () => {
  await accion('rechazar', { motivo: 'M'.repeat(250) });
  assert.equal(estado.notificaciones.length, 1);
  assert.ok(
    estado.notificaciones[0].mensaje.length <= 255,
    `el mensaje mide ${estado.notificaciones[0].mensaje.length} caracteres`
  );
});

test('una lista sin responsable se resuelve igual, pero sin aviso', async () => {
  preparar('en_revision');
  estado.listas[0].fk_cedula_responsable = null;
  const { http } = await accion('aprobar');
  assert.equal(http, 200);
  assert.equal(estado.notificaciones.length, 0);
});
