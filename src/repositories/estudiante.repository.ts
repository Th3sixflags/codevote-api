import { pool } from '../config/database.js';
import { CrearEstudianteDTO, ActualizarEstudianteDTO } from '../schemas/estudiante.schema.js';
import bcrypt from 'bcryptjs';

// Se incluye la asignación de candidatura (cuando existe) para que el panel
// administrativo sepa en qué papeleta compite cada candidato.
const BASE_QUERY = `
  SELECT
    e.cedula, e.nombres, e.apellidos, e.correo_institucional, e.promedio, e.estado_academico, e.rol, e.foto_url,
    c.id_carrera, c.nombre_carrera,
    a.fk_id_votacion AS asig_votacion, a.estado AS asig_estado, a.fecha_asignacion AS asig_fecha,
    v.titulo_papeleta AS asig_papeleta, ac.nombre_carrera AS asig_carrera,
    p.id_proceso AS asig_proceso, p.nombre_proceso AS asig_nombre_proceso
  FROM estudiante e
  LEFT JOIN carrera c ON c.id_carrera = e.fk_id_carrera
  LEFT JOIN asignacion_candidatura a ON a.fk_cedula_estudiante = e.cedula
  LEFT JOIN votacion v ON v.id_votacion = a.fk_id_votacion
  LEFT JOIN carrera ac ON ac.id_carrera = v.fk_id_carrera
  LEFT JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
`;

/** Agrupa los campos de la asignación en un objeto (o null si no tiene). */
function conAsignacion(row: any) {
  if (!row) return row;
  const {
    asig_votacion, asig_estado, asig_fecha, asig_papeleta, asig_carrera,
    asig_proceso, asig_nombre_proceso, ...estudiante
  } = row;
  return {
    ...estudiante,
    asignacion: asig_votacion == null ? null : {
      fk_id_votacion:   asig_votacion,
      titulo_papeleta:  asig_papeleta,
      nombre_carrera:   asig_carrera,
      id_proceso:       asig_proceso,
      nombre_proceso:   asig_nombre_proceso,
      estado:           asig_estado,
      fecha_asignacion: asig_fecha,
    },
  };
}

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY e.apellidos, e.nombres');
  return (rows as any[]).map(conAsignacion);
}

export async function findByCedula(cedula: string) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE e.cedula = ?', [cedula]) as [any[], any];
  return conAsignacion(rows[0] ?? null);
}

/** Carrera del estudiante (o null si no tiene ninguna asignada). */
export async function findCarreraId(cedula: string): Promise<number | null> {
  const [rows] = await pool.query(
    'SELECT fk_id_carrera FROM estudiante WHERE cedula = ?',
    [cedula]
  ) as [any[], any];
  const valor = rows[0]?.fk_id_carrera;
  return valor == null ? null : Number(valor);
}

export async function findByEmail(email: string) {
  const [rows] = await pool.query('SELECT * FROM estudiante WHERE correo_institucional = ?', [email]) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearEstudianteDTO) {
  const hash = await bcrypt.hash(data.password, 12);
  // La cuenta nace con una contraseña temporal asignada por el administrador,
  // así que se marca para que la persona la cambie en su primer ingreso.
  await pool.query(
    `INSERT INTO estudiante (cedula, nombres, apellidos, correo_institucional, promedio, estado_academico, fk_id_carrera, password, rol, debe_cambiar_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
    // Si el administrador reinicia la contraseña, vuelve a ser temporal: la
    // persona deberá cambiarla en su siguiente ingreso.
    const hash = await bcrypt.hash(data.password, 12);
    await pool.query(
      'UPDATE estudiante SET password = ?, debe_cambiar_password = 1 WHERE cedula = ?',
      [hash, cedula]
    );
  }
  
  return findByCedula(cedula);
}

export async function remove(cedula: string) {
  await pool.query('DELETE FROM estudiante WHERE cedula = ?', [cedula]);
}

// --- Portal del estudiante (self-service) ---------------------------------

/** Actualiza solo la foto de perfil del estudiante. */
export async function updateFoto(cedula: string, fotoUrl: string | null) {
  await pool.query('UPDATE estudiante SET foto_url = ? WHERE cedula = ?', [fotoUrl, cedula]);
  return findByCedula(cedula);
}

/** Devuelve el hash de la contraseña (para verificar la actual al cambiarla). */
export async function getPasswordHash(cedula: string): Promise<string | null> {
  const [rows] = await pool.query('SELECT password FROM estudiante WHERE cedula = ?', [cedula]) as [any[], any];
  return rows[0]?.password ?? null;
}

/**
 * Reemplaza la contraseña por un nuevo hash y limpia la marca de contraseña
 * temporal: la persona ya eligió una propia.
 */
export async function updatePasswordHash(cedula: string, hash: string) {
  await pool.query(
    'UPDATE estudiante SET password = ?, debe_cambiar_password = 0 WHERE cedula = ?',
    [hash, cedula]
  );
}

/**
 * Búsqueda de posibles integrantes para una lista (portal del candidato).
 * Devuelve SOLO datos mínimos: cédula, nombres, apellidos y carrera. Nunca
 * contraseñas, correos ni promedios.
 *
 * @param carreraCompatible carrera exigida por la papeleta (null = papeleta
 *        global: cualquier carrera sirve).
 * @param texto             búsqueda por nombres, apellidos o cédula.
 */
export async function buscarPosiblesIntegrantes(
  carreraCompatible: number | null,
  texto: string,
  limite = 20
) {
  const patron = `%${texto}%`;
  const filtroCarrera = carreraCompatible == null ? '' : ' AND e.fk_id_carrera = ?';
  const params: any[] = [patron, patron, patron];
  if (carreraCompatible != null) params.push(carreraCompatible);
  params.push(limite);

  const [rows] = await pool.query(
    `SELECT e.cedula, e.nombres, e.apellidos, c.nombre_carrera
     FROM estudiante e
     LEFT JOIN carrera c ON c.id_carrera = e.fk_id_carrera
     WHERE (e.nombres LIKE ? OR e.apellidos LIKE ? OR e.cedula LIKE ?)
       ${filtroCarrera}
       -- Excluye a quienes ya tienen una candidatura activa.
       AND NOT EXISTS (
         SELECT 1 FROM candidato ca
         JOIN lista_candidata l ON l.id_lista = ca.fk_id_lista
         JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
         WHERE ca.fk_cedula_estudiante = e.cedula
           AND l.estado_revision NOT IN ('rechazada', 'retirada')
           AND p.estado NOT IN ('finalizado', 'cancelado')
           AND p.archivado_at IS NULL
       )
     ORDER BY e.apellidos, e.nombres
     LIMIT ?`,
    params
  );
  return rows as any[];
}
