import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';

export interface FilaValida {
  identificador: string;
  nombres: string;
  apellidos: string;
  correo: string;
  fk_id_carrera: number | null;
  estado_academico: string;
  fecha_ingreso: string | null;
  membresia_activa: number;
}

/** Retorna un mapa de { "nombre_carrera": id_carrera } para resolver las divisiones enviadas en el CSV. */
export async function mapCarreras(institucionId: number): Promise<Record<string, number>> {
  // Las carreras no tienen fk_id_institucion, pero según la arquitectura, cada carrera
  // podría estar global o asociada de alguna forma. Espera, el esquema no tiene fk_id_institucion en carrera.
  // Asumimos mapeo por nombre de todas las carreras disponibles.
  const [rows] = await pool.query<RowDataPacket[]>('SELECT id_carrera, nombre_carrera FROM carrera');
  const mapa: Record<string, number> = {};
  for (const row of rows) {
    mapa[row.nombre_carrera.trim().toLowerCase()] = row.id_carrera;
  }
  return mapa;
}

/** Recibe una lista de identificadores y devuelve un Set de aquellos que YA existen en la base de datos (global o por institución). */
export async function buscarIdentificadoresExistentes(identificadores: string[], institucionId: number): Promise<Set<string>> {
  if (identificadores.length === 0) return new Set();
  const placeholders = identificadores.map(() => '?').join(',');
  // Se valida de forma global porque 'cedula' es PK primaria en 'estudiante', no puede haber repetidos en todo el sistema.
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT cedula FROM estudiante WHERE cedula IN (${placeholders})`,
    identificadores
  );
  return new Set(rows.map(r => r.cedula));
}

/** Recibe una lista de correos y devuelve un Set de aquellos que YA existen. */
export async function buscarCorreosExistentes(correos: string[]): Promise<Set<string>> {
  if (correos.length === 0) return new Set();
  const placeholders = correos.map(() => '?').join(',');
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT correo_institucional FROM estudiante WHERE correo_institucional IN (${placeholders})`,
    correos
  );
  return new Set(rows.map(r => r.correo_institucional));
}

/** Inserta de forma masiva los estudiantes usando una transacción. */
export async function insertarMiembros(filas: FilaValida[], institucionId: number): Promise<void> {
  if (filas.length === 0) return;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const query = `
      INSERT INTO estudiante 
        (cedula, nombres, apellidos, correo_institucional, fk_id_carrera, estado_academico, fecha_ingreso, membresia_activa, fk_id_institucion, rol, debe_cambiar_password, password)
      VALUES ?
    `;

    // password por defecto puede ser NULL, el flujo normal asume que si es nulo no puede hacer login por contraseña.
    // O si se requiere login por contraseña, se genera uno (pero CodeVote usa OTP ahora para todos).
    const values = filas.map(f => [
      f.identificador,
      f.nombres,
      f.apellidos,
      f.correo,
      f.fk_id_carrera,
      f.estado_academico,
      f.fecha_ingreso,
      f.membresia_activa,
      institucionId,
      'estudiante', // rol
      0, // debe_cambiar_password
      '' // password (required by schema)
    ]);

    await conn.query(query, [values]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export interface CrearHistorialDTO {
  fk_id_institucion: number;
  cedula_importador: string;
  nombre_archivo: string;
  total_filas: number;
  filas_importadas: number;
  filas_rechazadas: number;
  filas_duplicadas: number;
  errores_json: any;
}

export async function crearHistorial(data: CrearHistorialDTO): Promise<number> {
  const query = `
    INSERT INTO historial_importacion (
      fk_id_institucion, cedula_importador, nombre_archivo, 
      total_filas, filas_importadas, filas_rechazadas, filas_duplicadas, errores_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [
    data.fk_id_institucion,
    data.cedula_importador,
    data.nombre_archivo,
    data.total_filas,
    data.filas_importadas,
    data.filas_rechazadas,
    data.filas_duplicadas,
    data.errores_json ? JSON.stringify(data.errores_json) : null
  ];

  const [result] = await pool.query<ResultSetHeader>(query, values);
  return result.insertId;
}

export async function findHistorial(institucionId: number, limit = 20, offset = 0) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT h.id_importacion, h.fecha, h.nombre_archivo, h.total_filas, h.filas_importadas, h.filas_rechazadas, h.filas_duplicadas,
            e.nombres as importador_nombres, e.apellidos as importador_apellidos
     FROM historial_importacion h
     JOIN estudiante e ON e.cedula = h.cedula_importador
     WHERE h.fk_id_institucion = ?
     ORDER BY h.fecha DESC
     LIMIT ? OFFSET ?`,
    [institucionId, limit, offset]
  );
  return rows;
}

export async function findHistorialById(id: number, institucionId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM historial_importacion WHERE id_importacion = ? AND fk_id_institucion = ?`,
    [id, institucionId]
  );
  return rows[0] ?? null;
}
