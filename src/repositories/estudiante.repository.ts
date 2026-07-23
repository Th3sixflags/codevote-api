import { pool } from '../config/database.js';
import { CrearEstudianteDTO, ActualizarEstudianteDTO } from '../schemas/estudiante.schema.js';
import bcrypt from 'bcryptjs';

const BASE_QUERY = `
  SELECT
    e.cedula, e.nombres, e.apellidos, e.correo_institucional, e.promedio, e.estado_academico, e.rol,
    c.id_carrera, c.nombre_carrera
  FROM estudiante e
  LEFT JOIN carrera c ON c.id_carrera = e.fk_id_carrera
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY e.apellidos, e.nombres');
  return rows as any[];
}

export async function findByCedula(cedula: string) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE e.cedula = ?', [cedula]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByEmail(email: string) {
  const [rows] = await pool.query('SELECT * FROM estudiante WHERE correo_institucional = ?', [email]) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearEstudianteDTO) {
  const hash = await bcrypt.hash(data.password, 12);
  await pool.query(
    `INSERT INTO estudiante (cedula, nombres, apellidos, correo_institucional, promedio, estado_academico, fk_id_carrera, password, rol)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.cedula, data.nombres, data.apellidos, data.correo_institucional, data.promedio ?? null, data.estado_academico ?? 'activo', data.fk_id_carrera ?? null, hash, data.rol ?? 'estudiante']
  );
  return findByCedula(data.cedula);
}

export async function update(cedula: string, data: ActualizarEstudianteDTO) {
  const entradas = Object.entries(data).filter(([k, v]) => v !== undefined && k !== 'password');
  if (entradas.length > 0) {
    const sets = entradas.map(([k]) => `${k} = ?`).join(', ');
    const valores = entradas.map(([, v]) => v);
    await pool.query(`UPDATE estudiante SET ${sets} WHERE cedula = ?`, [...valores, cedula]);
  }
  
  if (data.password) {
    const hash = await bcrypt.hash(data.password, 12);
    await pool.query('UPDATE estudiante SET password = ? WHERE cedula = ?', [hash, cedula]);
  }
  
  return findByCedula(cedula);
}

export async function remove(cedula: string) {
  await pool.query('DELETE FROM estudiante WHERE cedula = ?', [cedula]);
}
