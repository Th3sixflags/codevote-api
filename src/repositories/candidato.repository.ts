import { pool } from '../config/database.js';
import { CrearCandidatoDTO, ActualizarCandidatoDTO } from '../schemas/candidato.schema.js';

const BASE_QUERY = `
  SELECT
    c.id_candidato, c.cargo, c.cumple_requisitos, c.foto_url,
    c.fk_cedula_estudiante, e.nombres, e.apellidos,
    CONCAT(e.nombres, ' ', e.apellidos) AS nombre_completo,
    c.fk_id_lista, l.nombre_lista
  FROM candidato c
  JOIN estudiante e ON e.cedula = c.fk_cedula_estudiante
  JOIN lista_candidata l ON l.id_lista = c.fk_id_lista
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY c.id_candidato');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE c.id_candidato = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByLista(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE c.fk_id_lista = ?', [id]);
  return rows as any[];
}

export async function create(data: CrearCandidatoDTO) {
  const [result] = await pool.query(
    `INSERT INTO candidato (cargo, cumple_requisitos, foto_url, fk_cedula_estudiante, fk_id_lista)
     VALUES (?, ?, ?, ?, ?)`,
    [data.cargo, data.cumple_requisitos ?? null, data.foto_url ?? null, data.fk_cedula_estudiante, data.fk_id_lista]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarCandidatoDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE candidato SET ${sets} WHERE id_candidato = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM candidato WHERE id_candidato = ?', [id]);
}
