import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';
import { CrearInstitucionDTO, ActualizarInstitucionDTO, AsignarAdminDTO } from '../schemas/institucion.schema.js';

/** Convierte un nombre a un slug URL-safe: minúsculas, sin acentos, espacios → guiones. */
function slugificar(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar acentos
    .replace(/[^a-z0-9\s-]/g, '')                       // solo alfanuméricos
    .trim()
    .replace(/\s+/g, '-')                                // espacios → guiones
    .replace(/-+/g, '-');                                // múltiples guiones → uno
}

export async function findAll() {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM institucion ORDER BY nombre');
  return rows;
}

export async function findById(id: number) {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM institucion WHERE id_institucion = ?', [id]);
  return rows[0] ?? null;
}

export async function findBySlug(slug: string) {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM institucion WHERE slug = ?', [slug]);
  return rows[0] ?? null;
}

export async function create(data: CrearInstitucionDTO) {
  const slug = data.slug || slugificar(data.nombre);
  const query = `
    INSERT INTO institucion (
      nombre, slug, tipo, logo_url, descripcion, email_contacto,
      telefono, direccion, sitio_web, dominio_email, colores_json, config_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [
    data.nombre,
    slug,
    data.tipo ?? 'universidad',
    data.logo_url ?? null,
    data.descripcion ?? null,
    data.email_contacto ?? null,
    data.telefono ?? null,
    data.direccion ?? null,
    data.sitio_web ?? null,
    data.dominio_email ?? null,
    data.colores_json ? JSON.stringify(data.colores_json) : null,
    data.config_json ? JSON.stringify(data.config_json) : null,
  ];
  const [result] = await pool.query<ResultSetHeader>(query, values);
  return result.insertId;
}

export async function update(id: number, data: ActualizarInstitucionDTO) {
  const updates: string[] = [];
  const values: any[] = [];

  if (data.nombre !== undefined) { updates.push('nombre = ?'); values.push(data.nombre); }
  if (data.slug !== undefined) { updates.push('slug = ?'); values.push(data.slug); }
  if (data.tipo !== undefined) { updates.push('tipo = ?'); values.push(data.tipo); }
  if (data.logo_url !== undefined) { updates.push('logo_url = ?'); values.push(data.logo_url); }
  if (data.descripcion !== undefined) { updates.push('descripcion = ?'); values.push(data.descripcion); }
  if (data.email_contacto !== undefined) { updates.push('email_contacto = ?'); values.push(data.email_contacto); }
  if (data.telefono !== undefined) { updates.push('telefono = ?'); values.push(data.telefono); }
  if (data.direccion !== undefined) { updates.push('direccion = ?'); values.push(data.direccion); }
  if (data.sitio_web !== undefined) { updates.push('sitio_web = ?'); values.push(data.sitio_web); }
  if (data.dominio_email !== undefined) { updates.push('dominio_email = ?'); values.push(data.dominio_email); }
  if (data.colores_json !== undefined) { updates.push('colores_json = ?'); values.push(data.colores_json ? JSON.stringify(data.colores_json) : null); }
  if (data.config_json !== undefined) { updates.push('config_json = ?'); values.push(data.config_json ? JSON.stringify(data.config_json) : null); }

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
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM estudiante_por_institucion WHERE rol = "admin" AND fk_id_institucion = ?', [id]),
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM estudiante_por_institucion WHERE fk_id_institucion = ?', [id]),
  ]);
  
  return {
    procesos: procesos[0].count,
    admins: admins[0].count,
    miembros: miembros[0].count,
  };
}

export async function findAdmins(id: number) {
  const query = 'SELECT cedula, nombres, apellidos, correo_institucional, estado_academico, rol, foto_url FROM estudiante_por_institucion WHERE rol = "admin" AND fk_id_institucion = ? ORDER BY apellidos, nombres';
  const [rows] = await pool.query<RowDataPacket[]>(query, [id]);
  return rows;
}

/**
 * Miembros que un superadministrador puede promover dentro de una institución.
 * Se limita deliberadamente a datos de contacto mínimos: no expone promedio,
 * carrera ni credenciales en un flujo que únicamente necesita identificar a la
 * persona elegida.
 */
export async function findMiembrosParaAdministrar(id: number, buscar = '') {
  const filtroBusqueda = buscar
    ? ' AND (cedula LIKE ? OR nombres LIKE ? OR apellidos LIKE ? OR correo_institucional LIKE ?)'
    : '';
  const valores: Array<string | number> = [id];
  if (buscar) {
    const patron = `%${buscar}%`;
    valores.push(patron, patron, patron, patron);
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT cedula, nombres, apellidos, correo_institucional, estado_academico, rol
     FROM estudiante_por_institucion
     WHERE fk_id_institucion = ?${filtroBusqueda}
     ORDER BY apellidos, nombres
     LIMIT 30`,
    valores
  );
  return rows;
}

export async function promoteMiembroAAdmin(id: number, cedula: string) {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE estudiante_institucion
     SET rol = 'admin'
     WHERE cedula = ? AND fk_id_institucion = ? AND rol = 'estudiante' AND estado_academico = 'activo' AND membresia_activa = 1`,
    [cedula, id]
  );
  if (Number(result.affectedRows ?? 0) > 0) return true;
  const [legacy] = await pool.query<ResultSetHeader>(
    `UPDATE estudiante
     SET rol = 'admin'
     WHERE cedula = ? AND fk_id_institucion = ? AND rol = 'estudiante' AND estado_academico = 'activo'`,
    [cedula, id]
  );
  return Number(legacy.affectedRows ?? 0) > 0;
}

export async function assignAdmin(id: number, admin: AsignarAdminDTO) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [identidad] = await conn.query('SELECT cedula FROM estudiante WHERE cedula = ? FOR UPDATE', [admin.cedula]) as [any[], any];
    if (identidad.length === 0) {
      await conn.query(
        `INSERT INTO estudiante
          (cedula, nombres, apellidos, correo_institucional, estado_academico, rol, fk_id_institucion, password, debe_cambiar_password)
         VALUES (?, ?, ?, ?, 'activo', 'admin', ?, '', 1)`,
        [admin.cedula, admin.nombres, admin.apellidos, admin.correo_institucional, id]
      );
    }
    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO estudiante_institucion
        (cedula, fk_id_institucion, nombres, apellidos, correo_institucional,
         estado_academico, membresia_activa, rol, foto_url)
       VALUES (?, ?, ?, ?, ?, 'activo', 1, 'admin', NULL)`,
      [admin.cedula, id, admin.nombres, admin.apellidos, admin.correo_institucional]
    );
    await conn.commit();
    return result.affectedRows;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
