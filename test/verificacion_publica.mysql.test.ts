/** E2E de la verificación pública contra MySQL real, sin identidad ni voto. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import express from 'express';
import { pool } from '../src/config/database.js';
import verificacionPublicaRoutes from '../src/routes/verificacion_publica.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const marca = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
// No deriva de `marca`: proceso y papeleta sí usan la marca, por lo que así la
// aserción detecta de verdad una cédula filtrada y no una coincidencia casual.
const cedula = `9${randomUUID().replace(/-/g, '').slice(0, 9)}`;
const correo = `verificacion-${marca}@pruebas.codevote`;
const codigo = randomUUID();
let institucionId = 0;
let procesoId = 0;
let votacionId = 0;

const app = express();
app.use('/api/verificar-voto', verificacionPublicaRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

before(async () => {
  const [institucion] = await pool.query(
    `INSERT INTO institucion (nombre, slug, tipo, activo) VALUES (?, ?, 'universidad', 1)`,
    [`Institución verificación ${marca}`, `verificacion-${marca}`]
  ) as [any, any];
  institucionId = Number(institucion.insertId);

  await pool.query(
    `INSERT INTO estudiante
       (cedula, nombres, apellidos, correo_institucional, password, estado_academico, rol, fk_id_institucion)
     VALUES (?, 'Identidad', 'QueNoDebeSalir', ?, 'no-es-una-clave-real', 'activo', 'estudiante', ?)`,
    [cedula, correo, institucionId]
  );
  const [proceso] = await pool.query(
    `INSERT INTO proceso_electoral
       (nombre_proceso, tipo_proceso, fecha_convocatoria, fecha_inicio_votacion,
        fecha_fin_votacion, estado, fk_id_institucion)
     VALUES (?, 'consejo_estudiantil', '2026-08-01', '2026-08-01 08:00:00',
             '2026-08-01 18:00:00', 'finalizado', ?)`,
    [`Proceso público ${marca}`, institucionId]
  ) as [any, any];
  procesoId = Number(proceso.insertId);

  const [votacion] = await pool.query(
    `INSERT INTO votacion
       (fk_id_proceso, titulo_papeleta, fecha_apertura, fecha_cierre, estado)
     VALUES (?, ?, '2026-08-01 08:00:00', '2026-08-01 18:00:00', 'cerrada')`,
    [procesoId, `Papeleta pública ${marca}`]
  ) as [any, any];
  votacionId = Number(votacion.insertId);

  // Existe un voto blanco y un comprobante vinculado al elector. La ruta
  // pública no consulta esa tabla ni puede revelar ninguno de esos dos datos.
  await pool.query(
    `INSERT INTO voto (fk_id_votacion, tipo_voto) VALUES (?, 'blanco')`,
    [votacionId]
  );
  await pool.query(
    `INSERT INTO codigo_voto
       (fk_id_votacion, codigo_hash, estado_codigo, fecha_envio, fk_cedula_estudiante, codigo_verificacion)
     VALUES (?, 'hash-secreto-de-prueba', 'usado', '2026-08-01 12:00:00', ?, ?)`,
    [votacionId, cedula, codigo]
  );

  await new Promise<void>((resolve) => {
    servidor = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      resolve();
    });
  });
});

after(async () => {
  if (servidor) await new Promise<void>((resolve) => servidor.close(() => resolve()));
  if (votacionId) await pool.query('DELETE FROM codigo_voto WHERE codigo_verificacion = ?', [codigo]);
  if (votacionId) await pool.query('DELETE FROM voto WHERE fk_id_votacion = ?', [votacionId]);
  if (votacionId) await pool.query('DELETE FROM votacion WHERE id_votacion = ?', [votacionId]);
  if (procesoId) await pool.query('DELETE FROM proceso_electoral WHERE id_proceso = ?', [procesoId]);
  if (institucionId) await pool.query('DELETE FROM estudiante WHERE cedula = ?', [cedula]);
  if (institucionId) await pool.query('DELETE FROM institucion WHERE id_institucion = ?', [institucionId]);
  await pool.end();
});

test('MySQL/E2E: el código público confirma participación sin revelar identidad ni sentido', async () => {
  const respuesta = await fetch(`${baseUrl}/api/verificar-voto/${codigo}`);
  const cuerpo = await respuesta.json();
  assert.equal(respuesta.status, 200);
  assert.deepEqual(Object.keys(cuerpo).sort(), ['estado', 'fecha_registro', 'papeleta', 'proceso', 'valido']);
  assert.equal(cuerpo.valido, true);
  assert.equal(cuerpo.proceso, `Proceso público ${marca}`);
  assert.equal(cuerpo.papeleta, `Papeleta pública ${marca}`);
  assert.equal(cuerpo.fecha_registro, '2026-08-01 12:00:00');
  assert.equal(cuerpo.estado, 'registrado');

  const json = JSON.stringify(cuerpo);
  for (const secreto of [cedula, correo, 'Identidad', 'QueNoDebeSalir', 'blanco', 'hash-secreto-de-prueba']) {
    assert.ok(!json.includes(secreto), `la verificación pública expone ${secreto}`);
  }
  assert.ok(!/\bid_[a-z_]+\b/i.test(json), 'la verificación pública expone un ID interno');
});

test('MySQL/E2E: un código inexistente no revela registros', async () => {
  const respuesta = await fetch(`${baseUrl}/api/verificar-voto/${randomUUID()}`);
  assert.equal(respuesta.status, 404);
  assert.deepEqual(await respuesta.json(), { error: 'Comprobante no encontrado.' });
});
