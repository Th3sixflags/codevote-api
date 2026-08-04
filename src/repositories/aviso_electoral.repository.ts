import { pool } from '../config/database.js';

/**
 * Padrón, avisos ya enviados y sanciones.
 *
 * ANONIMATO: la participación se lee SIEMPRE de `codigo_voto`, que prueba quién
 * votó pero no qué votó. La tabla `voto` no se toca en ningún punto de este
 * repositorio, así que ni los recordatorios ni las sanciones pueden relacionar
 * a una persona con su opción.
 */

export type TipoAviso = 'convocatoria' | 'apertura' | 'cierre_proximo' | 'sancion';

export interface Destinatario {
  cedula: string;
  nombres: string;
  apellidos: string;
  correo_institucional: string;
}

/**
 * Padrón de una papeleta: estudiantes y candidatos activos a los que les
 * corresponde votarla. Papeleta de carrera -> solo esa carrera; papeleta global
 * (`carreraVotacion` en null) -> todo el padrón.
 *
 * Es el mismo criterio que `countHabilitados` en voto.repository: quien recibe
 * el aviso es exactamente quien puede votar.
 */
export async function padronDePapeleta(
  carreraVotacion: number | null, soloPendientes: boolean, votacionId: number
): Promise<Destinatario[]> {
  const [rows] = await pool.query(
    `SELECT e.cedula, e.nombres, e.apellidos, e.correo_institucional
       FROM estudiante e
      WHERE e.estado_academico = 'activo'
        AND e.rol IN ('estudiante', 'candidato')
        AND (? IS NULL OR e.fk_id_carrera = ?)
        ${soloPendientes ? `AND NOT EXISTS (
              SELECT 1 FROM codigo_voto cv
               WHERE cv.fk_id_votacion = ? AND cv.fk_cedula_estudiante = e.cedula)` : ''}
      ORDER BY e.apellidos, e.nombres`,
    soloPendientes
      ? [carreraVotacion, carreraVotacion, votacionId]
      : [carreraVotacion, carreraVotacion]
  ) as [any[], any];
  return rows as Destinatario[];
}

/** Padrón de todo un proceso: la unión del de sus papeletas, sin repetir. */
export async function padronDeProceso(procesoId: number): Promise<Destinatario[]> {
  const [rows] = await pool.query(
    `SELECT DISTINCT e.cedula, e.nombres, e.apellidos, e.correo_institucional
       FROM estudiante e
       JOIN votacion v ON v.fk_id_proceso = ?
      WHERE e.estado_academico = 'activo'
        AND e.rol IN ('estudiante', 'candidato')
        AND (v.fk_id_carrera IS NULL OR v.fk_id_carrera = e.fk_id_carrera)
      ORDER BY e.apellidos, e.nombres`,
    [procesoId]
  ) as [any[], any];
  return rows as Destinatario[];
}

/** Datos de una papeleta con su proceso y carrera, para componer los correos. */
export interface PapeletaParaAviso {
  id_votacion: number;
  titulo_papeleta: string;
  fecha_apertura: string;
  fecha_cierre: string;
  estado: string;
  carrera_votacion: number | null;
  nombre_carrera: string | null;
  id_proceso: number;
  nombre_proceso: string;
  tipo_proceso: string;
  descripcion: string | null;
  estado_proceso: string;
}

const PAPELETA_QUERY = `
  SELECT v.id_votacion, v.titulo_papeleta, v.fecha_apertura, v.fecha_cierre, v.estado,
         v.fk_id_carrera AS carrera_votacion, c.nombre_carrera,
         p.id_proceso, p.nombre_proceso, p.tipo_proceso, p.descripcion,
         p.estado AS estado_proceso
    FROM votacion v
    JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
    LEFT JOIN carrera c ON c.id_carrera = v.fk_id_carrera
`;

export async function papeletaParaAviso(votacionId: number): Promise<PapeletaParaAviso | null> {
  const [rows] = await pool.query(
    `${PAPELETA_QUERY} WHERE v.id_votacion = ?`, [votacionId]
  ) as [any[], any];
  return rows[0] ?? null;
}

/**
 * Papeletas de procesos NO archivados que están dentro del periodo indicado,
 * usadas por la tarea programada para decidir qué avisos tocan.
 *
 * @param desde  límite inferior de la fecha comparada
 * @param hasta  límite superior
 * @param campo  'fecha_apertura' o 'fecha_cierre'
 */
export async function papeletasEnVentana(
  campo: 'fecha_apertura' | 'fecha_cierre', desde: string, hasta: string
): Promise<PapeletaParaAviso[]> {
  const [rows] = await pool.query(
    `${PAPELETA_QUERY}
      WHERE p.archivado_at IS NULL
        AND p.estado NOT IN ('cancelado')
        AND v.${campo} BETWEEN ? AND ?`,
    [desde, hasta]
  ) as [any[], any];
  return rows as PapeletaParaAviso[];
}

/**
 * Reserva el aviso ANTES de enviarlo: si la fila ya existía, devuelve false y
 * quien llama no envía nada.
 *
 * El INSERT contra la clave única es la barrera real. Comprobar y luego insertar
 * dejaría una ventana en la que dos pasadas —o dos instancias del servidor—
 * mandarían el mismo correo a todo el padrón.
 */
export async function reservarAviso(votacionId: number, tipo: TipoAviso): Promise<boolean> {
  try {
    await pool.query(
      'INSERT INTO aviso_papeleta (fk_id_votacion, tipo) VALUES (?, ?)',
      [votacionId, tipo]
    );
    return true;
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) return false;
    throw err;
  }
}

/** Anota cuántos recibieron el aviso y si el correo llegó a salir. */
export async function anotarResultadoDeAviso(
  votacionId: number, tipo: TipoAviso, destinatarios: number, correoEnviado: boolean
) {
  await pool.query(
    'UPDATE aviso_papeleta SET destinatarios = ?, correo_enviado = ? WHERE fk_id_votacion = ? AND tipo = ?',
    [destinatarios, correoEnviado ? 1 : 0, votacionId, tipo]
  );
}

/** ¿Ya se envió ese aviso? Solo para consultas del panel: no sustituye a reservarAviso. */
export async function avisoYaEnviado(votacionId: number, tipo: TipoAviso): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT 1 FROM aviso_papeleta WHERE fk_id_votacion = ? AND tipo = ? LIMIT 1',
    [votacionId, tipo]
  ) as [any[], any];
  return rows.length > 0;
}

// --- Sanciones --------------------------------------------------------------

/**
 * Registra las sanciones de quienes no votaron. Devuelve cuántas se crearon.
 * `INSERT IGNORE` sobre la clave única (papeleta, cédula): reprocesar el cierre
 * no duplica sanciones ni falla.
 */
export async function registrarSanciones(
  votacionId: number, cedulas: string[], motivo: string
): Promise<number> {
  if (cedulas.length === 0) return 0;
  const valores = cedulas.map(() => '(?, ?, ?)').join(', ');
  const params = cedulas.flatMap((cedula) => [cedula, votacionId, motivo]);
  const [result] = await pool.query(
    `INSERT IGNORE INTO sancion_electoral (fk_cedula_estudiante, fk_id_votacion, motivo)
     VALUES ${valores}`,
    params
  ) as [any, any];
  return Number(result.affectedRows ?? 0);
}

export async function marcarSancionesNotificadas(votacionId: number) {
  await pool.query(
    'UPDATE sancion_electoral SET correo_enviado = 1 WHERE fk_id_votacion = ?',
    [votacionId]
  );
}

const SANCION_QUERY = `
  SELECT s.id_sancion, s.fk_cedula_estudiante, s.fk_id_votacion, s.motivo,
         s.fecha_sancion, s.estado, s.observacion, s.correo_enviado,
         e.nombres, e.apellidos, e.correo_institucional,
         c.nombre_carrera,
         v.titulo_papeleta, p.id_proceso, p.nombre_proceso
    FROM sancion_electoral s
    JOIN estudiante e ON e.cedula = s.fk_cedula_estudiante
    LEFT JOIN carrera c ON c.id_carrera = e.fk_id_carrera
    JOIN votacion v ON v.id_votacion = s.fk_id_votacion
    JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
`;

/** Sanciones para el panel administrativo, filtrables por papeleta o proceso. */
export async function listarSanciones(filtros: { votacionId?: number; procesoId?: number }) {
  const donde: string[] = [];
  const params: any[] = [];
  if (filtros.votacionId) { donde.push('s.fk_id_votacion = ?'); params.push(filtros.votacionId); }
  if (filtros.procesoId)  { donde.push('p.id_proceso = ?');     params.push(filtros.procesoId); }

  const [rows] = await pool.query(
    `${SANCION_QUERY}${donde.length ? ` WHERE ${donde.join(' AND ')}` : ''}
      ORDER BY s.fecha_sancion DESC, e.apellidos`,
    params
  ) as [any[], any];
  return rows.map((r) => ({ ...r, correo_enviado: Number(r.correo_enviado) === 1 }));
}

/** Sanciones de una persona (las ve en su propio portal). */
export async function sancionesDeEstudiante(cedula: string) {
  const [rows] = await pool.query(
    `${SANCION_QUERY} WHERE s.fk_cedula_estudiante = ? ORDER BY s.fecha_sancion DESC`,
    [cedula]
  ) as [any[], any];
  return rows.map((r) => ({ ...r, correo_enviado: Number(r.correo_enviado) === 1 }));
}

/**
 * Cambia el estado de una sanción (justificarla o anularla). Nunca se borra:
 * la sanción es historial electoral y su resolución debe quedar registrada.
 */
export async function resolverSancion(id: number, estado: string, observacion: string | null) {
  const [result] = await pool.query(
    'UPDATE sancion_electoral SET estado = ?, observacion = ? WHERE id_sancion = ?',
    [estado, observacion, id]
  ) as [any, any];
  if (Number(result.affectedRows) === 0) return null;
  const [rows] = await pool.query(`${SANCION_QUERY} WHERE s.id_sancion = ?`, [id]) as [any[], any];
  return rows[0] ?? null;
}
