/** Integración MySQL: el bloqueo de papeleta serializa voto y cierre. */
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { pool } from '../src/config/database.js';
import * as votoRepo from '../src/repositories/voto.repository.js';
import * as cierreRepo from '../src/repositories/cierre_votacion.repository.js';
import { registrarVoto } from '../src/services/voto.service.js';

const sufijo = String(Date.now()).slice(-8);
let institucionId = 0;
let procesoId = 0;
let votacionId = 0;
const cedula = `vot${sufijo}`;

before(async () => {
  institucionId = Number(((await pool.query(
    `INSERT INTO institucion (nombre, slug, tipo, activo) VALUES (?, ?, 'universidad', 1)`,
    [`Voto ${sufijo}`, `voto-${sufijo}`]
  ))[0] as any).insertId);
  await pool.query(
    `INSERT INTO estudiante
       (cedula, nombres, apellidos, correo_institucional, estado_academico, rol, fk_id_institucion)
     VALUES (?, 'Votante', 'Prueba', ?, 'activo', 'estudiante', ?)`,
    [cedula, `${cedula}@test.dev`, institucionId]
  );
  procesoId = Number(((await pool.query(
    `INSERT INTO proceso_electoral
       (nombre_proceso, tipo_proceso, fecha_convocatoria, fecha_inicio_votacion,
        fecha_fin_votacion, estado, fk_id_institucion)
     VALUES ('Proceso carrera', 'referendum', CURDATE(), '2026-01-01 00:00:00',
             '2099-12-31 23:59:59', 'votacion', ?)`,
    [institucionId]
  ))[0] as any).insertId);
  votacionId = Number(((await pool.query(
    `INSERT INTO votacion
       (fk_id_proceso, titulo_papeleta, fecha_apertura, fecha_cierre, estado)
     VALUES (?, 'Papeleta carrera', '2026-01-01 00:00:00', '2099-12-31 23:59:59', 'abierta')`,
    [procesoId]
  ))[0] as any).insertId);
});

after(async () => {
  await pool.query('DELETE FROM notificacion WHERE fk_cedula_estudiante = ?', [cedula]);
  await pool.query('DELETE FROM codigo_voto WHERE fk_id_votacion = ?', [votacionId]);
  await pool.query('DELETE FROM voto WHERE fk_id_votacion = ?', [votacionId]);
  await pool.query('DELETE FROM acta_resultados WHERE fk_id_votacion = ?', [votacionId]);
  await pool.query('DELETE FROM votacion WHERE id_votacion = ?', [votacionId]);
  await pool.query('DELETE FROM proceso_electoral WHERE id_proceso = ?', [procesoId]);
  await pool.query('DELETE FROM estudiante WHERE cedula = ?', [cedula]);
  await pool.query('DELETE FROM institucion WHERE id_institucion = ?', [institucionId]);
});

test('dos votos simultáneos producen un voto y un comprobante', async () => {
  const payload = { fk_id_votacion: votacionId, fk_id_lista: null, tipo_voto: 'blanco' as const };
  const resultados = await Promise.allSettled([
    registrarVoto(payload, cedula, institucionId),
    registrarVoto(payload, cedula, institucionId),
  ]);
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.filter((r) => r.status === 'rejected').length, 1);
  assert.equal(await votoRepo.countVotantes(votacionId), 1);
  const [votos] = await pool.query('SELECT COUNT(*) AS total FROM voto WHERE fk_id_votacion = ?', [votacionId]) as [any[], any];
  assert.equal(Number(votos[0].total), 1);
});

test('si el cierre obtiene primero el bloqueo, el voto se rechaza', async () => {
  await pool.query('DELETE FROM codigo_voto WHERE fk_id_votacion = ?', [votacionId]);
  await pool.query('DELETE FROM voto WHERE fk_id_votacion = ?', [votacionId]);
  await pool.query("UPDATE votacion SET estado = 'abierta' WHERE id_votacion = ?", [votacionId]);

  const conn = await pool.getConnection();
  await conn.beginTransaction();
  await conn.query('SELECT id_votacion FROM votacion WHERE id_votacion = ? FOR UPDATE', [votacionId]);

  const intento = registrarVoto(
    { fk_id_votacion: votacionId, fk_id_lista: null, tipo_voto: 'blanco' },
    cedula,
    institucionId
  ).then(
    (valor) => ({ estado: 'cumplida' as const, valor }),
    (error) => ({ estado: 'rechazada' as const, error })
  );
  const cierre = cierreRepo.cerrarSiSigueAbierta(votacionId);

  await conn.query("UPDATE votacion SET estado = 'cerrada' WHERE id_votacion = ?", [votacionId]);
  await conn.commit();
  conn.release();

  assert.equal(await cierre, false, 'el cierre condicionado observa que ya quedó cerrada');
  const resultado = await intento;
  assert.equal(resultado.estado, 'rechazada');
  if (resultado.estado === 'rechazada') assert.match(String(resultado.error?.message), /cerrada|finaliz/i);
  assert.equal(await votoRepo.countVotantes(votacionId), 0);
});
