import { pool } from '../config/database.js';

const BASE_QUERY = `
  SELECT
    v.id_votacion, v.titulo_papeleta, v.fecha_apertura, v.fecha_cierre, v.estado,
    p.id_proceso, p.nombre_proceso
  FROM votacion v
  JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY v.fecha_apertura DESC');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE v.id_votacion = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByProceso(procesoId: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE v.fk_id_proceso = ? ORDER BY v.fecha_apertura', [procesoId]);
  return rows as any[];
}
