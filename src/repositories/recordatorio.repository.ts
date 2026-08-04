import { pool } from '../config/database.js';

/** Recordatorios que la administración programa a mano desde el panel. */

export interface RecordatorioProgramado {
  id_recordatorio: number;
  fk_id_proceso: number;
  fk_id_votacion: number | null;
  asunto: string;
  mensaje: string;
  programado_para: string;
  solo_pendientes: number;
  enviado_at: string | null;
  destinatarios: number | null;
  error: string | null;
}

const BASE_QUERY = `
  SELECT r.id_recordatorio, r.fk_id_proceso, r.fk_id_votacion, r.asunto, r.mensaje,
         r.programado_para, r.solo_pendientes, r.enviado_at, r.destinatarios, r.error,
         r.creado_at, r.fk_cedula_creador,
         p.nombre_proceso, v.titulo_papeleta
    FROM recordatorio_programado r
    JOIN proceso_electoral p ON p.id_proceso = r.fk_id_proceso
    LEFT JOIN votacion v ON v.id_votacion = r.fk_id_votacion
`;

/** Normaliza los 0/1 de MySQL y deriva el estado que muestra el panel. */
function conEstado(row: any) {
  if (!row) return row;
  return {
    ...row,
    solo_pendientes: Number(row.solo_pendientes) === 1,
    estado: row.error ? 'fallido' : row.enviado_at ? 'enviado' : 'pendiente',
  };
}

export async function findAll(procesoId?: number) {
  const [rows] = await pool.query(
    `${BASE_QUERY}${procesoId ? ' WHERE r.fk_id_proceso = ?' : ''} ORDER BY r.programado_para DESC`,
    procesoId ? [procesoId] : []
  ) as [any[], any];
  return rows.map(conEstado);
}

export async function findById(id: number) {
  const [rows] = await pool.query(`${BASE_QUERY} WHERE r.id_recordatorio = ?`, [id]) as [any[], any];
  return conEstado(rows[0] ?? null);
}

export async function create(data: {
  fk_id_proceso: number;
  fk_id_votacion?: number | null;
  asunto: string;
  mensaje: string;
  programado_para: string;
  solo_pendientes?: boolean;
  creador?: string | null;
}) {
  const [result] = await pool.query(
    `INSERT INTO recordatorio_programado
       (fk_id_proceso, fk_id_votacion, asunto, mensaje, programado_para, solo_pendientes, fk_cedula_creador)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.fk_id_proceso, data.fk_id_votacion ?? null, data.asunto, data.mensaje,
      data.programado_para, data.solo_pendientes === false ? 0 : 1, data.creador ?? null,
    ]
  ) as [any, any];
  return findById(Number(result.insertId));
}

/** Solo se puede borrar un recordatorio que aún no salió. */
export async function remove(id: number): Promise<boolean> {
  const [result] = await pool.query(
    'DELETE FROM recordatorio_programado WHERE id_recordatorio = ? AND enviado_at IS NULL',
    [id]
  ) as [any, any];
  return Number(result.affectedRows) === 1;
}

/**
 * Reserva un recordatorio vencido para enviarlo.
 *
 * Marcar `enviado_at` ANTES de mandar el correo, y solo si seguía en null, es lo
 * que impide que dos pasadas de la tarea —o dos instancias del servidor— envíen
 * el mismo mensaje dos veces a todo el padrón. Si el envío falla después, se
 * anota el error en la propia fila (el correo duplicado es peor que el aviso
 * perdido, que la administración ve como "fallido" y puede reprogramar).
 */
export async function reservarVencido(corte: string): Promise<number | null> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id_recordatorio FROM recordatorio_programado
        WHERE enviado_at IS NULL AND programado_para <= ?
        ORDER BY programado_para
        LIMIT 1
        FOR UPDATE`,
      [corte]
    ) as [any[], any];

    const id = rows[0]?.id_recordatorio;
    if (!id) { await conn.commit(); return null; }

    await conn.query(
      'UPDATE recordatorio_programado SET enviado_at = NOW() WHERE id_recordatorio = ?',
      [id]
    );
    await conn.commit();
    return Number(id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function anotarResultado(id: number, destinatarios: number, error: string | null) {
  await pool.query(
    'UPDATE recordatorio_programado SET destinatarios = ?, error = ? WHERE id_recordatorio = ?',
    [destinatarios, error, id]
  );
}
