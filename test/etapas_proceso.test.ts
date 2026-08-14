import { test } from 'node:test';
import assert from 'node:assert';
import { pool } from '../src/config/database.js';
import { ahoraEnEcuador } from '../src/utils/zonaHoraria.js';
import { avanzarEtapasPrevias } from '../src/services/etapas_proceso.service.js';

test('Transiciones automáticas de etapas tempranas del proceso', async (t) => {
  let procesoId: number;
  const ahora = ahoraEnEcuador();
  const hoy = ahora.substring(0, 10);

  // 1. Preparar un proceso en estado 'planificado' con fechas en el pasado
  t.beforeEach(async () => {
    const [result] = await pool.query(
      `INSERT INTO proceso_electoral 
        (nombre_proceso, tipo_proceso, fecha_convocatoria, fecha_inicio_inscripcion, fecha_fin_inscripcion, fecha_inicio_votacion, fecha_fin_votacion, estado, fk_id_institucion)
       VALUES (?, 'consejo_estudiantil', ?, ?, ?, ?, ?, 'planificado', 1)`,
      ['Proceso Test Etapas', hoy, ahora, null, ahora, ahora]
    ) as [any, any];
    procesoId = result.insertId;
  });

  t.afterEach(async () => {
    await pool.query('DELETE FROM proceso_electoral WHERE id_proceso = ?', [procesoId]);
  });

  await t.test('avanzarEtapasPrevias mueve a inscripcion si se cumplen las fechas', async () => {
    const modificados = await avanzarEtapasPrevias();
    assert(modificados > 0, 'Debería haber modificado al menos un proceso');

    const [rows] = await pool.query('SELECT estado FROM proceso_electoral WHERE id_proceso = ?', [procesoId]) as [any[], any];
    assert.strictEqual(rows[0].estado, 'inscripcion', 'El proceso debería estar en estado inscripcion');
  });

  await t.test('avanzarEtapasPrevias mueve a campaña si la inscripcion ya pasó', async () => {
    // Forzamos fecha de fin de inscripción en el pasado
    await pool.query(
      `UPDATE proceso_electoral SET fecha_fin_inscripcion = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id_proceso = ?`,
      [procesoId]
    );

    const modificados = await avanzarEtapasPrevias();
    assert(modificados > 0, 'Debería haber avanzado la etapa');

    const [rows] = await pool.query('SELECT estado FROM proceso_electoral WHERE id_proceso = ?', [procesoId]) as [any[], any];
    assert.strictEqual(rows[0].estado, 'campaña', 'El proceso debería haber avanzado a campaña');
  });
});
