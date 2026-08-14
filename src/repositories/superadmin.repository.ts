import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';



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
  const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM estudiante_por_institucion');
  return rows[0].count;
}

export async function countVotosTotal() {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM voto');
  return rows[0].count;
}
