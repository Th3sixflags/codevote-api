import { pool } from '../config/database.js';
import { CrearCarreraDTO, ActualizarCarreraDTO } from '../schemas/carrera.schema.js';

const BASE_QUERY = `
  SELECT
    c.id_carrera, c.nombre_carrera, c.fk_id_director, c.fk_id_facultad,
    f.nombre_facultad,
    CONCAT(d.nombres, ' ', d.apellidos) AS director
  FROM carrera c
  LEFT JOIN facultad f ON f.id_facultad = c.fk_id_facultad
  LEFT JOIN director d ON d.id_director = c.fk_id_director
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY c.id_carrera');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE c.id_carrera = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearCarreraDTO) {
  const [result] = await pool.query(
    `INSERT INTO carrera (nombre_carrera, fk_id_director, fk_id_facultad)
     VALUES (?, ?, ?)`,
    [data.nombre_carrera, data.fk_id_director ?? null, data.fk_id_facultad ?? null]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarCarreraDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE carrera SET ${sets} WHERE id_carrera = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM carrera WHERE id_carrera = ?', [id]);
}
