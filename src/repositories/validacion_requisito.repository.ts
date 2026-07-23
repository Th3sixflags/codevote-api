import { pool } from '../config/database.js';
import { CrearValidacionRequisitoDTO, ActualizarValidacionRequisitoDTO } from '../schemas/validacion_requisito.schema.js';

const BASE_QUERY = `
  SELECT
    v.id_validacion, v.cumple, v.observacion, v.fecha_validacion,
    v.fk_id_candidato, CONCAT(e.nombres, ' ', e.apellidos) AS candidato,
    v.fk_id_requisito, r.nombre_requisito
  FROM validacion_requisito v
  JOIN candidato c ON c.id_candidato = v.fk_id_candidato
  JOIN estudiante e ON e.cedula = c.fk_cedula_estudiante
  JOIN requisito r ON r.id_requisito = v.fk_id_requisito
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY v.id_validacion');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE v.id_validacion = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByCandidato(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE v.fk_id_candidato = ?', [id]);
  return rows as any[];
}

export async function create(data: CrearValidacionRequisitoDTO) {
  const [result] = await pool.query(
    `INSERT INTO validacion_requisito (cumple, observacion, fecha_validacion, fk_id_candidato, fk_id_requisito)
     VALUES (?, ?, ?, ?, ?)`,
    [data.cumple ?? null, data.observacion ?? null, data.fecha_validacion, data.fk_id_candidato, data.fk_id_requisito]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarValidacionRequisitoDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE validacion_requisito SET ${sets} WHERE id_validacion = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM validacion_requisito WHERE id_validacion = ?', [id]);
}
