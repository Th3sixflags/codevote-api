import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { pool } from '../src/config/database.js';
import { yaVotoEstudiante } from '../src/repositories/voto.repository.js';
import { randomUUID } from 'node:crypto';

const sufijo = String(Date.now()).slice(-8);
let institucionId = 0;
let procesoId = 0;
let votacionId = 0;
const cedula = `yve${sufijo.substring(0, 7)}`;

before(async () => {
  institucionId = Number(((await pool.query(
    `INSERT INTO institucion (nombre, slug, tipo, activo) VALUES (?, ?, 'universidad', 1)`,
    [`YVE ${sufijo}`, `yve-${sufijo}`]
  ))[0] as any).insertId);

  await pool.query(
    `INSERT INTO estudiante
       (cedula, nombres, apellidos, correo_institucional, estado_academico, rol, fk_id_institucion)
     VALUES (?, 'Estudiante', 'YVE', ?, 'activo', 'estudiante', ?)`,
    [cedula, `${cedula}@test.dev`, institucionId]
  );

  procesoId = Number(((await pool.query(
    `INSERT INTO proceso_electoral
       (nombre_proceso, tipo_proceso, fecha_convocatoria, fecha_inicio_votacion,
        fecha_fin_votacion, estado, fk_id_institucion)
     VALUES ('Proceso YVE', 'referendum', CURDATE(), '2026-01-01 00:00:00',
             '2099-12-31 23:59:59', 'votacion', ?)`,
    [institucionId]
  ))[0] as any).insertId);

  votacionId = Number(((await pool.query(
    `INSERT INTO votacion (fk_id_proceso, titulo_papeleta, estado, fecha_apertura, fecha_cierre)
     VALUES (?, 'Papeleta YVE', 'abierta', '2026-01-01 00:00:00', '2099-12-31 23:59:59')`,
    [procesoId]
  ))[0] as any).insertId);
});

after(async () => {
  await pool.query('DELETE FROM codigo_voto WHERE fk_id_votacion = ?', [votacionId]);
  await pool.query('DELETE FROM votacion WHERE id_votacion = ?', [votacionId]);
  await pool.query('DELETE FROM proceso_electoral WHERE id_proceso = ?', [procesoId]);
  await pool.query('DELETE FROM estudiante WHERE cedula = ?', [cedula]);
  await pool.query('DELETE FROM institucion WHERE id_institucion = ?', [institucionId]);
  await pool.end();
});

test('yaVotoEstudiante devuelve false si no hay comprobante', async () => {
  const yaVoto = await yaVotoEstudiante(votacionId, cedula);
  assert.equal(yaVoto, false);
});

test('yaVotoEstudiante devuelve false si el comprobante está en estado "generado"', async () => {
  await pool.query(
    `INSERT INTO codigo_voto (fk_id_votacion, fk_cedula_estudiante, estado_codigo, codigo_verificacion, codigo_hash)
     VALUES (?, ?, 'generado', ?, 'hash1')`,
    [votacionId, cedula, randomUUID()]
  );

  const yaVoto = await yaVotoEstudiante(votacionId, cedula);
  assert.equal(yaVoto, false, 'No debe bloquear si el código solo fue generado');
  
  // Limpieza para la siguiente prueba
  await pool.query('DELETE FROM codigo_voto WHERE fk_id_votacion = ?', [votacionId]);
});

test('yaVotoEstudiante devuelve false si el comprobante está en estado "enviado"', async () => {
  await pool.query(
    `INSERT INTO codigo_voto (fk_id_votacion, fk_cedula_estudiante, estado_codigo, codigo_verificacion, codigo_hash)
     VALUES (?, ?, 'enviado', ?, 'hash2')`,
    [votacionId, cedula, randomUUID()]
  );

  const yaVoto = await yaVotoEstudiante(votacionId, cedula);
  assert.equal(yaVoto, false, 'No debe bloquear si el código solo fue enviado');
  
  // Limpieza para la siguiente prueba
  await pool.query('DELETE FROM codigo_voto WHERE fk_id_votacion = ?', [votacionId]);
});

test('yaVotoEstudiante devuelve true si el comprobante está en estado "usado"', async () => {
  await pool.query(
    `INSERT INTO codigo_voto (fk_id_votacion, fk_cedula_estudiante, estado_codigo, codigo_verificacion, codigo_hash)
     VALUES (?, ?, 'usado', ?, 'hash3')`,
    [votacionId, cedula, randomUUID()]
  );

  const yaVoto = await yaVotoEstudiante(votacionId, cedula);
  assert.equal(yaVoto, true, 'Debe bloquear la votación si ya tiene un código usado');
});
