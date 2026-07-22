import { pool } from '../config/database';
import { CrearCronogramaDTO, ActualizarCronogramaDTO } from '../schemas/cronograma.schema';

const BASE_QUERY = `
  SELECT
    c.id_cronograma, c.actividad, c.fecha_inicio, c.fecha_fin,
    c.fk_id_proceso, p.nombre_proceso,
    c.fk_id_responsable, CONCAT(r.nombres, ' ', r.apellidos) AS responsable
  FROM cronograma c
  JOIN proceso_electoral p ON p.id_proceso = c.fk_id_proceso
  JOIN responsable r ON r.id_responsable = c.fk_id_responsable
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY c.id_cronograma');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE c.id_cronograma = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByProceso(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE c.fk_id_proceso = ?', [id]);
  return rows as any[];
}

export async function create(data: CrearCronogramaDTO) {
  const [result] = await pool.query(
    `INSERT INTO cronograma (fk_id_proceso, fk_id_responsable, actividad, fecha_inicio, fecha_fin)
     VALUES (?, ?, ?, ?, ?)`,
    [data.fk_id_proceso, data.fk_id_responsable, data.actividad, data.fecha_inicio, data.fecha_fin]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarCronogramaDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE cronograma SET ${sets} WHERE id_cronograma = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM cronograma WHERE id_cronograma = ?', [id]);
}
