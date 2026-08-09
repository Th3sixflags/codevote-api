import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';

export async function findByCorreo(correo: string) {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM superadmin WHERE correo = ?', [correo]);
  return rows[0] ?? null;
}

export async function findById(id: number) {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM superadmin WHERE id_superadmin = ?', [id]);
  return rows[0] ?? null;
}

export async function create(data: { nombres: string, apellidos: string, correo: string, password_hash: string }) {
  const query = 'INSERT INTO superadmin (nombres, apellidos, correo, password_hash) VALUES (?, ?, ?, ?)';
  const [result] = await pool.query<ResultSetHeader>(query, [data.nombres, data.apellidos, data.correo, data.password_hash]);
  return result.insertId;
}

export async function countInstituciones() {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM institucion WHERE activo = 1');
  return rows[0].count;
}

export async function countProcesosActivos() {
  const query = `
    SELECT COUNT(*) as count 
    FROM proceso_electoral 
    WHERE estado IN ('convocado', 'inscripcion', 'campaña', 'votacion', 'escrutinio')
  `;
  const [rows] = await pool.query<RowDataPacket[]>(query);
  return rows[0].count;
}

export async function countMiembrosTotal() {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM estudiante');
  return rows[0].count;
}

export async function countVotosTotal() {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM voto');
  return rows[0].count;
}
