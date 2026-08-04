import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../config/database.js';
import { CrearVotoDTO } from '../schemas/voto.schema.js';

const BASE_QUERY = `
  SELECT
    v.id_voto, v.tipo_voto, v.fecha_hora,
    vot.id_votacion, vot.titulo_papeleta,
    l.id_lista, l.nombre_lista
  FROM voto v
  JOIN votacion vot ON vot.id_votacion = v.fk_id_votacion
  LEFT JOIN lista_candidata l ON l.id_lista = v.fk_id_lista
`;

export async function findByVotacion(votacionId: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE v.fk_id_votacion = ? ORDER BY v.fecha_hora DESC', [votacionId]);
  return rows as any[];
}

/** Indica si el estudiante ya emitió su voto en esta votación (tiene comprobante). */
export async function yaVotoEstudiante(votacionId: number, cedula: string): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT 1 FROM codigo_voto WHERE fk_id_votacion = ? AND fk_cedula_estudiante = ? LIMIT 1',
    [votacionId, cedula]
  ) as [any[], any];
  return rows.length > 0;
}

/**
 * Registra el voto y su comprobante en una transacción.
 * - El voto se guarda ANÓNIMO (sin cédula), en la tabla `voto`.
 * - El comprobante (codigo_voto) se guarda con la cédula del estudiante, para
 *   probar la participación sin revelar la elección. No hay relación entre
 *   ambos registros, de modo que el voto sigue siendo secreto.
 */
export async function createConComprobante(data: CrearVotoDTO, cedula: string) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

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

    await conn.commit();

    const [rows] = await conn.query(BASE_QUERY + ' WHERE v.id_voto = ?', [result.insertId]) as [any[], any];
    return { ...rows[0], comprobante: hash };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
  listaId: number, votacionId: number
): Promise<string | null> {
  const [rows] = await pool.query(
    'SELECT estado_revision FROM lista_candidata WHERE id_lista = ? AND fk_id_votacion = ? LIMIT 1',
    [listaId, votacionId]
  ) as [any[], any];
  return rows[0] ? String(rows[0].estado_revision) : null;
}

/**
 * Estado de la votación y de su proceso, más la carrera del proceso, para
 * decidir si se puede votar y si se pueden ver los resultados.
 */
export async function estadoDeVotacion(
  votacionId: number
): Promise<{ votacion: string; proceso: string; carrera_votacion: number | null; archivado: boolean } | null> {
  const [rows] = await pool.query(
    `SELECT v.estado AS votacion, p.estado AS proceso, v.fk_id_carrera AS carrera_votacion,
            (p.archivado_at IS NOT NULL) AS archivado
     FROM votacion v
     JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
     WHERE v.id_votacion = ?`,
    [votacionId]
  ) as [any[], any];
  const fila = rows[0];
  return fila ? { ...fila, archivado: Number(fila.archivado) === 1 } : null;
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
export async function countHabilitados(carreraVotacion: number | null) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM estudiante e
      WHERE e.estado_academico = 'activo'
        AND e.rol IN ('estudiante', 'candidato')
        AND (? IS NULL OR e.fk_id_carrera = ?)`,
    [carreraVotacion, carreraVotacion]
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
