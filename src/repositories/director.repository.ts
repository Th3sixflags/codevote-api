import { pool } from '../config/database.js';
import { CrearDirectorDTO, ActualizarDirectorDTO } from '../schemas/director.schema.js';

const BASE_QUERY = `
  SELECT id_director, nombres, apellidos, correo, fk_id_institucion FROM director
`;

export async function findAll(institucionId?: number) {
  const filtro = institucionId === undefined ? '' : ' WHERE fk_id_institucion = ?';
  const params = institucionId === undefined ? [] : [institucionId];
  const [rows] = await pool.query(BASE_QUERY + filtro + ' ORDER BY id_director', params);
  return rows as any[];
}

export async function findById(id: number, institucionId?: number) {
  const filtro = institucionId === undefined ? '' : ' AND fk_id_institucion = ?';
  const params = institucionId === undefined ? [id] : [id, institucionId];
  const [rows] = await pool.query(BASE_QUERY + ` WHERE id_director = ?${filtro}`, params) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearDirectorDTO, institucionId: number) {
  const [result] = await pool.query(
    `INSERT INTO director (nombres, apellidos, correo, fk_id_institucion)
     VALUES (?, ?, ?, ?)`,
    [data.nombres, data.apellidos, data.correo, institucionId]
  ) as [any, any];
  return findById(result.insertId, institucionId);
}

export async function update(id: number, data: ActualizarDirectorDTO, institucionId?: number) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id, institucionId);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  const filtro = institucionId === undefined ? '' : ' AND fk_id_institucion = ?';
  const params = institucionId === undefined ? [...valores, id] : [...valores, id, institucionId];
  await pool.query(`UPDATE director SET ${sets} WHERE id_director = ?${filtro}`, params);
  return findById(id, institucionId);
}

export async function remove(id: number, institucionId?: number) {
  const filtro = institucionId === undefined ? '' : ' AND fk_id_institucion = ?';
  const params = institucionId === undefined ? [id] : [id, institucionId];
  const [result] = await pool.query(`DELETE FROM director WHERE id_director = ?${filtro}`, params) as [any, any];
  return Number(result.affectedRows ?? 0) > 0;
}
