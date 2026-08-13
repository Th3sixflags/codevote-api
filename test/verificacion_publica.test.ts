/** Contrato HTTP de la verificación pública por código opaco, sin JWT ni IDs. */
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import express from 'express';
import { pool } from '../src/config/database.js';
import verificacionPublicaRoutes from '../src/routes/verificacion_publica.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const CODIGO_VALIDO = '6f1e2d3c-4b5a-4c6d-8e9f-0a1b2c3d4e5f';
const FILA_SENSIBLE = {
  id_codigo: 91,
  nombre_proceso: 'Elecciones 2026',
  titulo_papeleta: 'Consejo estudiantil',
  fecha_envio: '2026-08-12 10:30:00',
  fk_cedula_estudiante: '1105946139',
  nombres: 'Anyela Carolina',
  correo_institucional: 'anyela@uide.edu.ec',
  tipo_voto: 'valido',
  nombre_lista: 'Lista B',
  nombre_candidato: 'Felix Rodas',
};
const CAMPOS_PUBLICOS = ['estado', 'fecha_registro', 'papeleta', 'proceso', 'valido'];

const queryOriginal = pool.query.bind(pool);
const consultas: Array<{ sql: string; params: unknown[] }> = [];
const app = express();
app.use('/api/verificar-voto', verificacionPublicaRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

before(async () => {
  (pool as any).query = async (sql: string, params: unknown[]) => {
    consultas.push({ sql, params });
    return [[FILA_SENSIBLE], []];
  };
  await new Promise<void>((resolve) => {
    servidor = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      resolve();
    });
  });
});

after(async () => {
  (pool as any).query = queryOriginal;
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  await pool.end();
});

test('verifica públicamente un UUID sin JWT y no devuelve identidad ni voto', async () => {
  const respuesta = await fetch(`${baseUrl}/api/verificar-voto/${CODIGO_VALIDO}`);
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 200);
  assert.deepEqual(Object.keys(cuerpo).sort(), CAMPOS_PUBLICOS);
  assert.deepEqual(cuerpo, {
    valido: true,
    proceso: FILA_SENSIBLE.nombre_proceso,
    papeleta: FILA_SENSIBLE.titulo_papeleta,
    fecha_registro: FILA_SENSIBLE.fecha_envio,
    estado: 'registrado',
  });

  const json = JSON.stringify(cuerpo);
  for (const secreto of [
    FILA_SENSIBLE.fk_cedula_estudiante,
    FILA_SENSIBLE.nombres,
    FILA_SENSIBLE.correo_institucional,
    FILA_SENSIBLE.nombre_lista,
    FILA_SENSIBLE.nombre_candidato,
  ]) assert.ok(!json.includes(secreto), `la respuesta expone ${secreto}`);
  assert.ok(!/\bid_[a-z_]+\b/i.test(json), 'la respuesta expone un ID interno');
});

test('la consulta pública solo usa el código como parámetro y no toca datos sensibles', async () => {
  consultas.length = 0;
  await fetch(`${baseUrl}/api/verificar-voto/${CODIGO_VALIDO}`);
  assert.equal(consultas.length, 1);
  assert.deepEqual(consultas[0].params, [CODIGO_VALIDO]);
  const sql = consultas[0].sql.toLowerCase();
  for (const prohibido of ['id_codigo', 'fk_cedula_estudiante', 'estudiante', 'lista_candidata', 'candidato']) {
    assert.ok(!sql.includes(prohibido), `la consulta pública incluye ${prohibido}`);
  }
  assert.ok(!/\bjoin\s+voto\b/.test(sql), 'la consulta pública une la tabla voto');
});

test('rechaza IDs internos antes de consultar MySQL', async () => {
  consultas.length = 0;
  const respuesta = await fetch(`${baseUrl}/api/verificar-voto/91`);
  assert.equal(respuesta.status, 422);
  assert.equal(consultas.length, 0);
});
