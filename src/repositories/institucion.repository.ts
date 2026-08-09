import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';
import { CrearInstitucionDTO, ActualizarInstitucionDTO } from '../schemas/institucion.schema.js';

export async function findAll() {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM institucion ORDER BY nombre');
  return rows;
}

export async function findById(id: number) {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM institucion WHERE id_institucion = ?', [id]);
  return rows[0] ?? null;
}

export async function create(data: CrearInstitucionDTO) {
  const query = `
    INSERT INTO institucion (
      nombre, tipo, logo_url, descripcion, email_contacto,
      telefono, direccion, sitio_web, dominio_email, config
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [
    data.nombre,
    data.tipo ?? 'universidad',
    data.logo_url ?? null,
    data.descripcion ?? null,
    data.email_contacto ?? null,
    data.telefono ?? null,
    data.direccion ?? null,
    data.sitio_web ?? null,
    data.dominio_email ?? null,
    data.config ? JSON.stringify(data.config) : null,
  ];
  const [result] = await pool.query<ResultSetHeader>(query, values);
  return result.insertId;
}

export async function update(id: number, data: ActualizarInstitucionDTO) {
  const updates: string[] = [];
  const values: any[] = [];

  if (data.nombre !== undefined) { updates.push('nombre = ?'); values.push(data.nombre); }
  if (data.tipo !== undefined) { updates.push('tipo = ?'); values.push(data.tipo); }
  if (data.logo_url !== undefined) { updates.push('logo_url = ?'); values.push(data.logo_url); }
  if (data.descripcion !== undefined) { updates.push('descripcion = ?'); values.push(data.descripcion); }
  if (data.email_contacto !== undefined) { updates.push('email_contacto = ?'); values.push(data.email_contacto); }
  if (data.telefono !== undefined) { updates.push('telefono = ?'); values.push(data.telefono); }
  if (data.direccion !== undefined) { updates.push('direccion = ?'); values.push(data.direccion); }
  if (data.sitio_web !== undefined) { updates.push('sitio_web = ?'); values.push(data.sitio_web); }
  if (data.dominio_email !== undefined) { updates.push('dominio_email = ?'); values.push(data.dominio_email); }
  if (data.config !== undefined) { updates.push('config = ?'); values.push(data.config ? JSON.stringify(data.config) : null); }

  if (updates.length === 0) return 0;

  const query = `UPDATE institucion SET ${updates.join(', ')} WHERE id_institucion = ?`;
  values.push(id);
  const [result] = await pool.query<ResultSetHeader>(query, values);
  return result.affectedRows;
}

export async function toggleActivo(id: number) {
  const query = 'UPDATE institucion SET activo = NOT activo WHERE id_institucion = ?';
  const [result] = await pool.query<ResultSetHeader>(query, [id]);
  return result.affectedRows;
}

export async function countStats(id: number) {
  const [[procesos], [admins], [miembros]] = await Promise.all([
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM proceso_electoral WHERE fk_id_institucion = ?', [id]),
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM estudiante WHERE rol = "admin" AND fk_id_institucion = ?', [id]),
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM estudiante WHERE fk_id_institucion = ?', [id]),
  ]);
  
  return {
    procesos: procesos[0].count,
    admins: admins[0].count,
    miembros: miembros[0].count,
  };
}

export async function findAdmins(id: number) {
  const query = 'SELECT * FROM estudiante WHERE rol = "admin" AND fk_id_institucion = ? ORDER BY apellidos, nombres';
  const [rows] = await pool.query<RowDataPacket[]>(query, [id]);
  return rows;
}
