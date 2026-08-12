import { pool } from '../config/database.js';
import { CrearCarreraDTO, ActualizarCarreraDTO } from '../schemas/carrera.schema.js';

const BASE_QUERY = `
  SELECT
    c.id_carrera, c.nombre_carrera, c.fk_id_director, c.fk_id_facultad, c.fk_id_institucion,
    f.nombre_facultad,
    CONCAT(d.nombres, ' ', d.apellidos) AS director
  FROM carrera c
  LEFT JOIN facultad f ON f.id_facultad = c.fk_id_facultad
  LEFT JOIN director d ON d.id_director = c.fk_id_director
`;

export async function findAll(institucionId?: number) {
  const filtro = institucionId === undefined ? '' : ' WHERE c.fk_id_institucion = ?';
  const params = institucionId === undefined ? [] : [institucionId];
  const [rows] = await pool.query(BASE_QUERY + filtro + ' ORDER BY c.id_carrera', params);
  return rows as any[];
}

export async function findById(id: number, institucionId?: number) {
  const filtro = institucionId === undefined ? '' : ' AND c.fk_id_institucion = ?';
  const params = institucionId === undefined ? [id] : [id, institucionId];
  const [rows] = await pool.query(BASE_QUERY + ` WHERE c.id_carrera = ?${filtro}`, params) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearCarreraDTO, institucionId: number) {
  const [result] = await pool.query(
    `INSERT INTO carrera (nombre_carrera, fk_id_director, fk_id_facultad, fk_id_institucion)
     VALUES (?, ?, ?, ?)`,
    [data.nombre_carrera, data.fk_id_director ?? null, data.fk_id_facultad ?? null, institucionId]
  ) as [any, any];
  return findById(result.insertId, institucionId);
}

export async function update(id: number, data: ActualizarCarreraDTO, institucionId?: number) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id, institucionId);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  const filtro = institucionId === undefined ? '' : ' AND fk_id_institucion = ?';
  const params = institucionId === undefined ? [...valores, id] : [...valores, id, institucionId];
  await pool.query(`UPDATE carrera SET ${sets} WHERE id_carrera = ?${filtro}`, params);
  return findById(id, institucionId);
}

export async function remove(id: number, institucionId?: number) {
  const filtro = institucionId === undefined ? '' : ' AND fk_id_institucion = ?';
  const params = institucionId === undefined ? [id] : [id, institucionId];
  const [result] = await pool.query(`DELETE FROM carrera WHERE id_carrera = ?${filtro}`, params) as [any, any];
  return Number(result.affectedRows ?? 0) > 0;
}
