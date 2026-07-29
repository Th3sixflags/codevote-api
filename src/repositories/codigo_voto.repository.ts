import { randomUUID } from 'node:crypto';
import { pool } from '../config/database.js';
import { CrearCodigoVotoDTO, ActualizarCodigoVotoDTO } from '../schemas/codigo_voto.schema.js';

// Consulta de AUDITORÍA (solo admin): incluye codigo_hash y el código público
// de verificación, para poder cotejar el que reporte un estudiante.
const BASE_QUERY = `
  SELECT
    cv.id_codigo, cv.codigo_hash, cv.codigo_verificacion, cv.estado_codigo, cv.fecha_envio,
    cv.fk_id_votacion, v.titulo_papeleta, v.fecha_cierre,
    p.id_proceso, p.nombre_proceso,
    cv.fk_cedula_estudiante
  FROM codigo_voto cv
  JOIN votacion v ON v.id_votacion = cv.fk_id_votacion
  JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY cv.id_codigo');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE cv.id_codigo = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByVotacion(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE cv.fk_id_votacion = ?', [id]);
  return rows as any[];
}

/**
 * Comprobantes emitidos a un estudiante (usado por "Mis Recibos").
 * NO se incluye `codigo_hash`: el comprobante prueba la participación, pero el
 * hash se reserva a la auditoría administrativa para no revelar/relacionar nada
 * del voto. Los endpoints de admin (findAll/findById/findByVotacion) sí lo traen.
 */
export async function findByEstudiante(cedula: string) {
  const [rows] = await pool.query(
    `SELECT
       cv.id_codigo, cv.estado_codigo, cv.fecha_envio, cv.codigo_verificacion,
       cv.fk_id_votacion, v.titulo_papeleta, v.fecha_cierre,
       p.id_proceso, p.nombre_proceso,
       cv.fk_cedula_estudiante
     FROM codigo_voto cv
     JOIN votacion v ON v.id_votacion = cv.fk_id_votacion
     JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
     WHERE cv.fk_cedula_estudiante = ?
     ORDER BY cv.fecha_envio DESC, cv.id_codigo DESC`,
    [cedula]
  );
  return rows as any[];
}

/**
 * Datos de verificación de UN comprobante, solo si pertenece al estudiante.
 * Devuelve únicamente proceso, papeleta y fecha: nada de hash, cédula, correo
 * ni la opción votada (que además no está ligada a este registro).
 */
export async function findVerificacionDeEstudiante(id: number, cedula: string) {
  const [rows] = await pool.query(
    `SELECT
       cv.codigo_verificacion, cv.estado_codigo, cv.fecha_envio,
       v.titulo_papeleta, p.nombre_proceso
     FROM codigo_voto cv
     JOIN votacion v ON v.id_votacion = cv.fk_id_votacion
     JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
     WHERE cv.id_codigo = ? AND cv.fk_cedula_estudiante = ?`,
    [id, cedula]
  ) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearCodigoVotoDTO) {
  // `codigo_verificacion` es obligatorio y opaco: se genera aquí (UUID v4) y no
  // se acepta desde el body, para que nadie pueda fijar un valor predecible.
  const [result] = await pool.query(
    `INSERT INTO codigo_voto (fk_id_votacion, codigo_hash, estado_codigo, fecha_envio, fk_cedula_estudiante, codigo_verificacion)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.fk_id_votacion, data.codigo_hash, data.estado_codigo ?? null, data.fecha_envio ?? null, data.fk_cedula_estudiante, randomUUID()]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarCodigoVotoDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE codigo_voto SET ${sets} WHERE id_codigo = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM codigo_voto WHERE id_codigo = ?', [id]);
}
