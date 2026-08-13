import { randomUUID } from 'node:crypto';
import { pool } from '../config/database.js';
import { CrearCodigoVotoDTO, ActualizarCodigoVotoDTO } from '../schemas/codigo_voto.schema.js';

/**
 * Consulta ANÓNIMA de comprobantes, usada por las tres vistas de administración
 * (listado general, comprobante puntual y comprobantes de una votación).
 *
 * Ningún endpoint de admin devuelve identidad: no se selecciona
 * `fk_cedula_estudiante`, ni se une con `estudiante` (nombres, apellidos,
 * correo), ni con `voto`, `lista_candidata` o `candidato`. Un administrador
 * puede auditar cuántos comprobantes se emitieron, para qué papeleta y en qué
 * estado están, pero no reconstruir quién participó ni qué eligió.
 *
 * Se conservan `codigo_hash` y `codigo_verificacion` porque son identificadores
 * opacos: sirven para cotejar el comprobante que reporte un estudiante y por sí
 * solos no revelan identidad ni elección.
 */
const CONSULTA_ANONIMA = `
  SELECT
    cv.id_codigo, v.titulo_papeleta, cv.codigo_hash, cv.codigo_verificacion,
    cv.estado_codigo, cv.fecha_envio
  FROM codigo_voto cv
  JOIN votacion v ON v.id_votacion = cv.fk_id_votacion
  JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
`;

function condicionInstitucion(institucionId?: number): { sql: string; params: any[] } {
  if (institucionId === undefined) return { sql: '', params: [] };
  return { sql: ' AND p.fk_id_institucion = ?', params: [institucionId] };
}

export async function findAll(institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  const where = inst.sql ? ` WHERE 1=1${inst.sql}` : '';
  const [rows] = await pool.query(`${CONSULTA_ANONIMA}${where} ORDER BY cv.id_codigo`, inst.params);
  return rows as any[];
}

export async function findById(id: number, institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  const [rows] = await pool.query(`${CONSULTA_ANONIMA} WHERE cv.id_codigo = ?${inst.sql}`, [id, ...inst.params]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByVotacion(id: number, institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  const [rows] = await pool.query(`${CONSULTA_ANONIMA} WHERE cv.fk_id_votacion = ?${inst.sql}`, [id, ...inst.params]);
  return rows as any[];
}

/**
 * Comprobantes emitidos a un estudiante (usado por "Mis Recibos").
 * NO se incluye `codigo_hash`: el comprobante prueba la participación, pero el
 * hash se reserva a la auditoría administrativa para no revelar/relacionar nada
 * del voto. Los endpoints de admin (findAll/findById/findByVotacion) sí lo traen.
 */
export async function findByEstudiante(cedula: string, institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  const [rows] = await pool.query(
    `SELECT
       cv.id_codigo, cv.estado_codigo, cv.fecha_envio, cv.codigo_verificacion,
       cv.fk_id_votacion, v.titulo_papeleta, v.fecha_cierre,
       p.id_proceso, p.nombre_proceso,
       cv.fk_cedula_estudiante
     FROM codigo_voto cv
     JOIN votacion v ON v.id_votacion = cv.fk_id_votacion
     JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
     WHERE cv.fk_cedula_estudiante = ?${inst.sql}
     ORDER BY cv.fecha_envio DESC, cv.id_codigo DESC`,
    [cedula, ...inst.params]
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

/**
 * Verificación pública por el código opaco del comprobante.
 *
 * La consulta deliberadamente no une estudiante, voto, lista_candidata ni
 * candidato, y tampoco selecciona identificadores internos. Así, aun con un
 * comprobante válido, el resultado solo demuestra que una participación fue
 * registrada para una papeleta; no permite saber quién participó ni qué votó.
 */
export async function findVerificacionPublica(codigoVerificacion: string) {
  const [rows] = await pool.query(
    `SELECT
       p.nombre_proceso, v.titulo_papeleta, cv.fecha_envio
     FROM codigo_voto cv
     JOIN votacion v ON v.id_votacion = cv.fk_id_votacion
     JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
     WHERE cv.codigo_verificacion = ?
     LIMIT 1`,
    [codigoVerificacion]
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
