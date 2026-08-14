/** Integración P1 contra MySQL real: sesiones, auditoría y actas selladas. */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-p1-mysql';
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/config/database.js';
import authRoutes from '../src/routes/auth.routes.js';
import { requireAuth } from '../src/middleware/auth.js';
import { auditarMutacionesHttp } from '../src/middleware/auditoria.js';
import * as sesiones from '../src/repositories/sesion.repository.js';
import * as auditoria from '../src/repositories/auditoria.repository.js';
import * as cierreRepo from '../src/repositories/cierre_votacion.repository.js';
import * as actasService from '../src/services/acta_resultados.service.js';
import { hashActa } from '../src/utils/hashActa.js';

const marca = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
const cedula = marca.slice(-10).padStart(10, '8');
const slug = `p1-${marca}`;
const correo = `p1-${marca}@pruebas.codevote`;
let institucionId = 0;
let procesoId = 0;
let votacionId = 0;
let actaId = 0;
let eventoId = 0;

const app = express();
app.use(express.json());
app.use(auditarMutacionesHttp);
app.use('/api/auth', authRoutes);
app.get('/protegida', requireAuth, (req, res) => res.json({ sub: req.user!.sub }));

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

function token(idSesion: string) {
  return jwt.sign(
    { sub: cedula, email: correo, rol: 'admin', fk_id_institucion: institucionId, jti: idSesion },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
}

async function sesionNueva() {
  const idSesion = randomUUID();
  assert.equal(await sesiones.crearSiEstaDisponible({
    idSesion,
    cedula,
    // La sesión debe quedar ligada al mismo tenant que el JWT. Sin esta
    // columna el middleware de P1 la rechaza como sesión huérfana.
    institucionId,
    expiraAt: new Date(Date.now() + 60 * 60 * 1000),
    ip: '127.0.0.1',
    userAgent: 'prueba-p1',
  }), true);
  return idSesion;
}

async function pedir(ruta: string, bearer: string, metodo = 'GET') {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${bearer}` },
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, body: texto ? JSON.parse(texto) : null };
}

before(async () => {
  const [institucion] = await pool.query(
    `INSERT INTO institucion (nombre, slug, tipo, activo)
     VALUES (?, ?, 'universidad', 1)`,
    [`Institución P1 ${marca}`, slug]
  ) as [any, any];
  institucionId = Number(institucion.insertId);

  await pool.query(
    `INSERT INTO estudiante
       (cedula, nombres, apellidos, correo_institucional, estado_academico, rol, fk_id_institucion)
     VALUES (?, 'Prueba', 'Seguridad', ?, 'activo', 'admin', ?)`,
    [cedula, correo, institucionId]
  );

  const [proceso] = await pool.query(
    `INSERT INTO proceso_electoral
       (nombre_proceso, tipo_proceso, fecha_convocatoria, fecha_inicio_votacion,
        fecha_fin_votacion, estado, fk_id_institucion)
     VALUES (?, 'consejo_estudiantil', '2026-08-01', '2026-08-01 08:00:00',
             '2026-08-01 18:00:00', 'finalizado', ?)`,
    [`Proceso P1 ${marca}`, institucionId]
  ) as [any, any];
  procesoId = Number(proceso.insertId);

  const [votacion] = await pool.query(
    `INSERT INTO votacion
       (fk_id_proceso, titulo_papeleta, fecha_apertura, fecha_cierre, estado)
     VALUES (?, ?, '2026-08-01 08:00:00', '2026-08-01 18:00:00', 'cerrada')`,
    [procesoId, `Papeleta P1 ${marca}`]
  ) as [any, any];
  votacionId = Number(votacion.insertId);

  await new Promise<void>((resolve) => {
    servidor = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()));

  // Los triggers se desactivan únicamente para retirar el fixture; se recrean
  // antes de terminar para no cambiar el esquema compartido por la suite.
  await pool.query('DROP TRIGGER IF EXISTS trg_acta_resultados_no_update');
  await pool.query('DROP TRIGGER IF EXISTS trg_acta_resultados_no_delete');
  await pool.query('DROP TRIGGER IF EXISTS trg_auditoria_evento_no_update');
  await pool.query('DROP TRIGGER IF EXISTS trg_auditoria_evento_no_delete');
  await pool.query('DELETE FROM auditoria_evento WHERE actor_cedula = ?', [cedula]);
  if (actaId) await pool.query('DELETE FROM acta_resultados WHERE id_acta = ?', [actaId]);
  await pool.query('DELETE FROM sesion WHERE fk_cedula_estudiante = ?', [cedula]);
  if (votacionId) await pool.query('DELETE FROM votacion WHERE id_votacion = ?', [votacionId]);
  if (procesoId) await pool.query('DELETE FROM proceso_electoral WHERE id_proceso = ?', [procesoId]);
  await pool.query('DELETE FROM estudiante WHERE cedula = ?', [cedula]);
  if (institucionId) await pool.query('DELETE FROM institucion WHERE id_institucion = ?', [institucionId]);

  await pool.query(`CREATE TRIGGER trg_auditoria_evento_no_update BEFORE UPDATE ON auditoria_evento
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La auditoría es inmutable: UPDATE no permitido.'`);
  await pool.query(`CREATE TRIGGER trg_auditoria_evento_no_delete BEFORE DELETE ON auditoria_evento
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La auditoría es inmutable: DELETE no permitido.'`);
  await pool.query(`CREATE TRIGGER trg_acta_resultados_no_update BEFORE UPDATE ON acta_resultados
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El acta es inmutable: UPDATE no permitido.'`);
  await pool.query(`CREATE TRIGGER trg_acta_resultados_no_delete BEFORE DELETE ON acta_resultados
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El acta es inmutable: DELETE no permitido.'`);
  await pool.end();
});

test('una sesión emitida funciona y logout la revoca inmediatamente', async () => {
  const idSesion = await sesionNueva();
  const bearer = token(idSesion);
  assert.equal((await pedir('/protegida', bearer)).status, 200);
  assert.equal((await pedir('/api/auth/logout', bearer, 'POST')).status, 204);
  assert.equal((await pedir('/protegida', bearer)).status, 401);
});

test('logout-todos revoca todas las sesiones de la cuenta', async () => {
  const actual = await sesionNueva();
  const otra = await sesionNueva();
  const respuesta = await pedir('/api/auth/logout-todos', token(actual), 'POST');
  assert.equal(respuesta.status, 200);
  assert.ok(respuesta.body.sesiones_revocadas >= 2);
  assert.equal(await sesiones.estaActiva(actual, cedula), false);
  assert.equal(await sesiones.estaActiva(otra, cedula), false);
});

test('producción rechaza JWT legacy sin jti cuando P1 ya está migrado', async () => {
  const legacy = jwt.sign(
    { sub: cedula, email: correo, rol: 'admin', fk_id_institucion: institucionId },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
  assert.equal((await pedir('/protegida', legacy)).status, 401);
});

test('el middleware anexa las mutaciones HTTP sin guardar el body', async () => {
  let filas: any[] = [];
  for (let intento = 0; intento < 20 && filas.length === 0; intento += 1) {
    [filas] = await pool.query(
      `SELECT accion, metodo, ruta, actor_cedula, detalles
         FROM auditoria_evento
        WHERE actor_cedula = ? AND metodo = 'POST'
        ORDER BY id_evento DESC LIMIT 1`,
      [cedula]
    ) as [any[], any];
    if (filas.length === 0) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(filas[0]?.accion, 'http.post');
  assert.equal(filas[0]?.actor_cedula, cedula);
  assert.ok(!JSON.stringify(filas[0]).includes('Bearer'), 'la auditoría guardó el token');
});

test('la auditoría conserva hash y MySQL impide editarla o borrarla', async () => {
  const evento: auditoria.EventoAuditoria = {
    actorCedula: cedula,
    actorRol: 'admin',
    institucionId,
    accion: 'prueba.p1',
    metodo: 'POST',
    ruta: '/prueba/p1',
    estadoHttp: 201,
    ip: '127.0.0.1',
    userAgent: 'prueba-p1',
    detalles: { resultado: 'aceptado' },
  };
  await auditoria.registrar(evento);
  const [rows] = await pool.query(
    `SELECT id_evento, hash_evento FROM auditoria_evento
      WHERE accion = 'prueba.p1' AND actor_cedula = ? ORDER BY id_evento DESC LIMIT 1`,
    [cedula]
  ) as [any[], any];
  eventoId = Number(rows[0].id_evento);
  assert.equal(rows[0].hash_evento, auditoria.hashEvento(evento));
  await assert.rejects(pool.query('UPDATE auditoria_evento SET accion = ? WHERE id_evento = ?', ['alterada', eventoId]));
  await assert.rejects(pool.query('DELETE FROM auditoria_evento WHERE id_evento = ?', [eventoId]));
});

test('el acta se sella con SHA-256 y MySQL impide editarla o borrarla', async () => {
  const datos = {
    votacionId,
    totalVotantes: 42,
    validos: 39,
    blancos: 2,
    nulos: 1,
    ganadora: 'Lista Ñ',
    fechaEmision: '2026-08-01 18:00:00',
  };
  await cierreRepo.emitirActa(datos);
  const [rows] = await pool.query(
    `SELECT id_acta, hash_version, hash_algoritmo, hash_acta
       FROM acta_resultados WHERE fk_id_votacion = ?`,
    [votacionId]
  ) as [any[], any];
  actaId = Number(rows[0].id_acta);
  assert.equal(Number(rows[0].hash_version), 1);
  assert.equal(rows[0].hash_algoritmo, 'SHA-256');
  assert.equal(rows[0].hash_acta, hashActa(datos));
  const [hashSql] = await pool.query(
    `SELECT SHA2(CONCAT(
       'codevote-acta:v1\n',
       'votacion:', fk_id_votacion, '\n',
       'total_votantes:', total_votantes, '\n',
       'votos_validos:', votos_validos, '\n',
       'votos_blanco:', votos_blanco, '\n',
       'votos_nulos:', votos_nulos, '\n',
       'lista_ganadora_hex:', UPPER(HEX(CONVERT(COALESCE(lista_ganadora, '') USING utf8mb4))), '\n',
       'fecha_emision:', DATE_FORMAT(fecha_emision, '%Y-%m-%d %H:%i:%s')
     ), 256) AS hash_migracion
     FROM acta_resultados WHERE id_acta = ?`,
    [actaId]
  ) as [any[], any];
  assert.equal(hashSql[0].hash_migracion, hashActa(datos), 'Node y el backfill SQL no canonizan igual');
  const integridad = await actasService.verificarIntegridad(actaId, institucionId);
  assert.equal(integridad?.integridad, 'valida');
  assert.equal(integridad?.hash_acta, hashActa(datos));
  await assert.rejects(pool.query('UPDATE acta_resultados SET votos_nulos = 99 WHERE id_acta = ?', [actaId]));
  await assert.rejects(pool.query('DELETE FROM acta_resultados WHERE id_acta = ?', [actaId]));
});
