import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../config/database.js';
import { CrearVotoDTO } from '../schemas/voto.schema.js';

type EjecutorSql = { query: (sql: string, params?: any[]) => Promise<any> };

const BASE_QUERY = `
  SELECT
    v.id_voto, v.tipo_voto, v.fecha_hora,
    vot.id_votacion, vot.titulo_papeleta,
    l.id_lista, l.nombre_lista
  FROM voto v
  JOIN votacion vot ON vot.id_votacion = v.fk_id_votacion
  JOIN proceso_electoral p ON p.id_proceso = vot.fk_id_proceso
  LEFT JOIN lista_candidata l ON l.id_lista = v.fk_id_lista
`;

function condicionInstitucion(institucionId?: number): { sql: string; params: any[] } {
  if (institucionId === undefined) return { sql: '', params: [] };
  return { sql: ' AND p.fk_id_institucion = ?', params: [institucionId] };
}

export async function findByVotacion(votacionId: number, institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  const [rows] = await pool.query(
    `${BASE_QUERY} WHERE v.fk_id_votacion = ?${inst.sql} ORDER BY v.fecha_hora DESC`,
    [votacionId, ...inst.params]
  );
  return rows as any[];
}

/** Indica si el estudiante ya emitió su voto en esta votación (tiene comprobante). */
export async function yaVotoEstudiante(
  votacionId: number,
  cedula: string,
  executor: EjecutorSql = pool as any
): Promise<boolean> {
  const [rows] = await executor.query(
    'SELECT 1 FROM codigo_voto WHERE fk_id_votacion = ? AND fk_cedula_estudiante = ? LIMIT 1',
    [votacionId, cedula]
  ) as [any[], any];
  return rows.length > 0;
}

/**
 * Ejecuta una operación con una única conexión y una única transacción.
 * Todas las validaciones decisivas del voto deben ocurrir dentro del callback.
 */
export async function enTransaccion<T>(operacion: (conn: EjecutorSql) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await operacion(conn as any);
    await conn.commit();
    return resultado;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Registra el voto y su comprobante usando la transacción que abrió el servicio.
 * - El voto se guarda ANÓNIMO (sin cédula), en la tabla `voto`.
 * - El comprobante (codigo_voto) se guarda con la cédula del estudiante, para
 *   probar la participación sin revelar la elección. No hay relación entre
 *   ambos registros, de modo que el voto sigue siendo secreto.
 */
export async function insertarVotoYComprobante(
  data: CrearVotoDTO,
  cedula: string,
  conn: EjecutorSql
) {
  const [result] = await conn.query(
    `INSERT INTO voto (fk_id_votacion, tipo_voto, fk_id_lista) VALUES (?, ?, ?)`,
    [data.fk_id_votacion, data.tipo_voto, data.fk_id_lista ?? null]
  ) as [any, any];

  const hash = createHash('sha256')
    .update(`${data.fk_id_votacion}:${cedula}:${Date.now()}:${randomBytes(8).toString('hex')}`)
    .digest('hex');

    // Código público de verificación: UUID v4 criptográficamente aleatorio. No
    // codifica cédula, correo, voto ni marca de tiempo, así que puede mostrarse
    // al estudiante sin comprometer el secreto del voto (a diferencia del hash,
    // que queda solo para la auditoría administrativa).
  const codigoVerificacion = randomUUID();

  await conn.query(
    `INSERT INTO codigo_voto (fk_id_votacion, codigo_hash, estado_codigo, fecha_envio, fk_cedula_estudiante, codigo_verificacion)
     VALUES (?, ?, 'usado', NOW(), ?, ?)`,
    [data.fk_id_votacion, hash, cedula, codigoVerificacion]
  );

  // Nunca releer ni devolver la fila de `voto`: contendría tipo/lista y sería
  // una correlación innecesaria desde la respuesta de la API al sufragio.
  return { registrado: true, codigo_verificacion: codigoVerificacion };
}

/**
 * Estado de revisión de una lista DENTRO de esa papeleta, o null si no compite
 * en ella. Cada lista pertenece a una votación concreta, así que la comprobación
 * es directa (antes se deducía por el proceso, lo que permitía votar por una
 * lista de otra categoría).
 *
 * Devuelve el estado, y no solo un booleano, porque solo se puede votar por una
 * lista APROBADA: una en preparación, en revisión, rechazada o retirada no es
 * una opción válida de la papeleta.
 */
export async function estadoDeListaEnVotacion(
  listaId: number, votacionId: number, executor: EjecutorSql = pool as any
): Promise<string | null> {
  const [rows] = await executor.query(
    'SELECT estado_revision FROM lista_candidata WHERE id_lista = ? AND fk_id_votacion = ? LIMIT 1',
    [listaId, votacionId]
  ) as [any[], any];
  return rows[0] ? String(rows[0].estado_revision) : null;
}

export interface EstadoDeVotacion {
  votacion: string;
  proceso: string;
  carrera_votacion: number | null;
  archivado: boolean;
  /** Ventana propia de la papeleta. */
  fecha_apertura: string | null;
  fecha_cierre: string | null;
  /** Fin del periodo de votación del proceso: el plazo que manda. */
  fecha_fin_votacion: string | null;
  fk_id_institucion: number;
}

/**
 * Estado de la votación y de su proceso, con las FECHAS además de los estados.
 *
 * Las fechas son imprescindibles: el cierre automático corre cada minuto, así
 * que `votacion.estado` puede seguir diciendo 'abierta' un rato después de la
 * hora final. Quien decide si se admite un voto tiene que mirar el reloj, no
 * solo esa columna (ver utils/estadoVotacion.ts).
 */
export async function estadoDeVotacion(
  votacionId: number,
  institucionId?: number,
  executor: EjecutorSql = pool as any,
  bloquear = false
): Promise<EstadoDeVotacion | null> {
  const inst = condicionInstitucion(institucionId);
  const [rows] = await executor.query(
    `SELECT v.estado AS votacion, p.estado AS proceso, v.fk_id_carrera AS carrera_votacion,
            p.fk_id_institucion,
            v.fecha_apertura, v.fecha_cierre, p.fecha_fin_votacion,
            (p.archivado_at IS NOT NULL) AS archivado
     FROM votacion v
     JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
     WHERE v.id_votacion = ?${inst.sql}${bloquear ? ' FOR UPDATE' : ''}`,
    [votacionId, ...inst.params]
  ) as [any[], any];
  const fila = rows[0];
  return fila ? { ...fila, archivado: Number(fila.archivado) === 1 } : null;
}

/**
 * Lee y bloquea la fila del votante dentro de la misma transacción del voto.
 * La institución y la carrera se obtienen de la base, no de una consulta previa
 * ni del body, para que no puedan cambiar entre la autorización y el INSERT.
 */
export async function votanteHabilitadoParaActualizar(
  cedula: string,
  institucionId: number,
  executor: EjecutorSql
) {
  const [rows] = await executor.query(
    `SELECT cedula, rol, estado_academico, fk_id_carrera, fk_id_institucion
       FROM estudiante
      WHERE cedula = ?
        AND fk_id_institucion = ?
        AND estado_academico = 'activo'
        AND rol IN ('estudiante', 'candidato')
      FOR UPDATE`,
    [cedula, institucionId]
  ) as [any[], any];
  return rows[0] ?? null;
}

/**
 * Conteo por opción de una papeleta.
 *
 * Incluye las listas que compiten aunque no hayan recibido votos (salen con
 * total_votos = 0), para que el panel muestre la papeleta completa y no solo a
 * quienes ya tienen votos. Los blancos y nulos aparecen como filas aparte, con
 * `id_lista` nulo: cuentan para la participación pero nunca pueden ganar.
 *
 * El conteo es agregado: nunca sale una fila por votante, así que no hay forma
 * de relacionar una persona con su voto.
 */
export async function countByVotacion(votacionId: number) {
  const [rows] = await pool.query(
    `SELECT l.id_lista, l.nombre_lista AS opcion, COUNT(v.id_voto) AS total_votos
       FROM lista_candidata l
       LEFT JOIN voto v
         ON v.fk_id_lista = l.id_lista
        AND v.fk_id_votacion = ?
        AND v.tipo_voto = 'valido'
      WHERE l.fk_id_votacion = ?
      GROUP BY l.id_lista, l.nombre_lista
     UNION ALL
     SELECT NULL AS id_lista, v.tipo_voto AS opcion, COUNT(*) AS total_votos
       FROM voto v
      WHERE v.fk_id_votacion = ? AND v.tipo_voto <> 'valido'
      GROUP BY v.tipo_voto
     ORDER BY total_votos DESC, opcion ASC`,
    [votacionId, votacionId, votacionId]
  );
  return rows as any[];
}

/**
 * Padrón habilitado para una papeleta.
 *
 * - Papeleta de carrera (`carreraVotacion` con valor): solo estudiantes activos
 *   de esa carrera. Papeleta global (`null`): todo el padrón activo.
 * - Cuenta a estudiantes y candidatos. Competir no quita el derecho al voto:
 *   un candidato vota como cualquiera, también en su propia papeleta, así que
 *   entra en el padrón y la participación puede llegar al 100%.
 * - No cuenta a la administración, que no vota.
 *
 * Devuelve un número, nunca la lista de personas.
 */
export async function countHabilitados(carreraVotacion: number | null, institucionId: number) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM estudiante e
      WHERE e.estado_academico = 'activo'
        AND e.rol IN ('estudiante', 'candidato')
        AND e.fk_id_institucion = ?
        AND (? IS NULL OR e.fk_id_carrera = ?)`,
    [institucionId, carreraVotacion, carreraVotacion]
  ) as [any[], any];
  return Number(rows[0]?.total ?? 0);
}

/**
 * Cuántas personas participaron: se cuentan los comprobantes emitidos, que son
 * uno por votante. Incluye a quienes votaron en blanco o nulo. Solo el total,
 * sin cédulas.
 */
export async function countVotantes(votacionId: number) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM codigo_voto WHERE fk_id_votacion = ?',
    [votacionId]
  ) as [any[], any];
  return Number(rows[0]?.total ?? 0);
}
