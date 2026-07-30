import { pool } from '../config/database.js';

/**
 * Borrado en cascada CONTROLADO de registros que siguen siendo borradores.
 *
 * Se hace a mano y en una transacción, en vez de con ON DELETE CASCADE en el
 * esquema: así solo se eliminan las dependencias de preparación y cualquier
 * evidencia electoral (votos, comprobantes, actas, veedurías) sigue protegida
 * por sus claves foráneas. Si algo cambia entre la comprobación y el borrado,
 * la FK aborta la transacción y no se pierde nada.
 */

/**
 * Elimina una lista candidata junto con sus dependencias de borrador:
 * validaciones de requisitos, candidatos y planes de trabajo.
 * Los votos NO se tocan: si la lista tiene votos, la FK impide el borrado.
 */
export async function eliminarListaEnCascada(listaId: number) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Validaciones de requisitos de los candidatos de la lista.
    await conn.query(
      `DELETE vr FROM validacion_requisito vr
       JOIN candidato c ON c.id_candidato = vr.fk_id_candidato
       WHERE c.fk_id_lista = ?`,
      [listaId]
    );
    await conn.query('DELETE FROM candidato WHERE fk_id_lista = ?', [listaId]);
    await conn.query('DELETE FROM plan_trabajo WHERE fk_id_lista = ?', [listaId]);
    await conn.query('DELETE FROM lista_candidata WHERE id_lista = ?', [listaId]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Elimina un proceso electoral junto con sus dependencias de borrador:
 * validaciones, candidatos, planes, listas, votaciones y cronogramas.
 * Votos, comprobantes, actas y veedurías quedan protegidos por sus FK.
 */
export async function eliminarProcesoEnCascada(procesoId: number) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Dependencias de las listas del proceso.
    await conn.query(
      `DELETE vr FROM validacion_requisito vr
       JOIN candidato c ON c.id_candidato = vr.fk_id_candidato
       JOIN lista_candidata l ON l.id_lista = c.fk_id_lista
       WHERE l.fk_id_proceso = ?`,
      [procesoId]
    );
    await conn.query(
      `DELETE c FROM candidato c
       JOIN lista_candidata l ON l.id_lista = c.fk_id_lista
       WHERE l.fk_id_proceso = ?`,
      [procesoId]
    );
    await conn.query(
      `DELETE pt FROM plan_trabajo pt
       JOIN lista_candidata l ON l.id_lista = pt.fk_id_lista
       WHERE l.fk_id_proceso = ?`,
      [procesoId]
    );
    await conn.query('DELETE FROM lista_candidata WHERE fk_id_proceso = ?', [procesoId]);

    // 2. Votaciones y cronogramas del proceso (sin actividad electoral).
    await conn.query('DELETE FROM votacion WHERE fk_id_proceso = ?', [procesoId]);
    await conn.query('DELETE FROM cronograma WHERE fk_id_proceso = ?', [procesoId]);

    // 3. El proceso.
    await conn.query('DELETE FROM proceso_electoral WHERE id_proceso = ?', [procesoId]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
