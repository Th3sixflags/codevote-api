import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../config/database.js';
import { CrearVotoDTO } from '../schemas/voto.schema.js';

const BASE_QUERY = `
  SELECT
    v.id_voto, v.tipo_voto, v.fecha_hora,
    vot.id_votacion, vot.titulo_papeleta,
    l.id_lista, l.nombre_lista
  FROM voto v
  JOIN votacion vot ON vot.id_votacion = v.fk_id_votacion
  LEFT JOIN lista_candidata l ON l.id_lista = v.fk_id_lista
`;

export async function findByVotacion(votacionId: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE v.fk_id_votacion = ? ORDER BY v.fecha_hora DESC', [votacionId]);
  return rows as any[];
}

/** Indica si el estudiante ya emitió su voto en esta votación (tiene comprobante). */
export async function yaVotoEstudiante(votacionId: number, cedula: string): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT 1 FROM codigo_voto WHERE fk_id_votacion = ? AND fk_cedula_estudiante = ? LIMIT 1',
    [votacionId, cedula]
  ) as [any[], any];
  return rows.length > 0;
}

/**
 * Registra el voto y su comprobante en una transacción.
 * - El voto se guarda ANÓNIMO (sin cédula), en la tabla `voto`.
 * - El comprobante (codigo_voto) se guarda con la cédula del estudiante, para
 *   probar la participación sin revelar la elección. No hay relación entre
 *   ambos registros, de modo que el voto sigue siendo secreto.
 */
export async function createConComprobante(data: CrearVotoDTO, cedula: string) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO voto (fk_id_votacion, tipo_voto, fk_id_lista) VALUES (?, ?, ?)`,
      [data.fk_id_votacion, data.tipo_voto, data.fk_id_lista ?? null]
    ) as [any, any];

    const hash = createHash('sha256')
      .update(`${data.fk_id_votacion}:${cedula}:${Date.now()}:${randomBytes(8).toString('hex')}`)
      .digest('hex');

    await conn.query(
      `INSERT INTO codigo_voto (fk_id_votacion, codigo_hash, estado_codigo, fecha_envio, fk_cedula_estudiante)
       VALUES (?, ?, 'usado', NOW(), ?)`,
      [data.fk_id_votacion, hash, cedula]
    );

    await conn.commit();

    const [rows] = await conn.query(BASE_QUERY + ' WHERE v.id_voto = ?', [result.insertId]) as [any[], any];
    return { ...rows[0], comprobante: hash };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Estado de la votación y de su proceso, para decidir si se pueden ver resultados. */
export async function estadoDeVotacion(
  votacionId: number
): Promise<{ votacion: string; proceso: string } | null> {
  const [rows] = await pool.query(
    `SELECT v.estado AS votacion, p.estado AS proceso
     FROM votacion v
     JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
     WHERE v.id_votacion = ?`,
    [votacionId]
  ) as [any[], any];
  return rows[0] ?? null;
}

export async function countByVotacion(votacionId: number) {
  const [rows] = await pool.query(
    `SELECT IFNULL(l.nombre_lista, v.tipo_voto) AS opcion, COUNT(*) AS total_votos
     FROM voto v
     LEFT JOIN lista_candidata l ON l.id_lista = v.fk_id_lista
     WHERE v.fk_id_votacion = ?
     GROUP BY l.nombre_lista, v.tipo_voto
     ORDER BY total_votos DESC`,
    [votacionId]
  );
  return rows as any[];
}
