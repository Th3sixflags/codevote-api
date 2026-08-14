import { pool } from '../config/database.js';

/**
 * Códigos de un solo uso (OTP) para iniciar sesión.
 *
 * Se guarda el SHA-256 del código, nunca el código: con acceso de lectura a la
 * base no se puede suplantar a nadie. La comparación se hace hasheando lo que
 * escribe la persona, así que el repositorio jamás necesita el valor original.
 */

export interface CodigoVigente {
  id_codigo: number;
  codigo_hash: string;
  intentos: number;
  expira_at: string;
  creado_at: string;
}

/**
 * Cuenta que puede iniciar sesión CON CÓDIGO, buscada por correo institucional
 * o por cédula: el formulario acepta cualquiera de los dos.
 *
 * Dos filtros, ambos en el SQL:
 *
 *   - solo cuentas ACTIVAS: una inactiva, egresada o graduada ya no forma parte
 *     del padrón y no debe poder entrar;
 *   - los tres roles reales (estudiante, candidato y admin) usan el mismo flujo.
 */
export async function buscarCuentasActivas(identificador: string, institucionSlug?: string) {
  const [rows] = await pool.query(
    `SELECT e.cedula, e.nombres, e.apellidos, e.correo_institucional,
            e.rol, e.foto_url, e.fk_id_institucion,
            i.slug AS institucion_slug, i.nombre AS institucion_nombre
       FROM (
         SELECT id_membresia, cedula, fk_id_institucion, nombres, apellidos,
                correo_institucional, estado_academico, membresia_activa, rol, foto_url
           FROM estudiante_por_institucion
         UNION ALL
         SELECT NULL, cedula, fk_id_institucion, nombres, apellidos,
                correo_institucional, estado_academico, membresia_activa, rol, foto_url
           FROM estudiante
          WHERE fk_id_institucion IS NULL AND rol = 'superadmin'
       ) e
       LEFT JOIN institucion i ON i.id_institucion = e.fk_id_institucion
      WHERE e.estado_academico = 'activo'
        AND e.membresia_activa = 1
        AND (e.correo_institucional = ? OR e.cedula = ?)
        AND (? IS NULL OR i.slug = ?)
        AND (i.id_institucion IS NULL OR i.activo = 1)
      ORDER BY CASE WHEN e.correo_institucional = ? THEN 0 ELSE 1 END, e.id_membresia`,
    [identificador, identificador, institucionSlug ?? null, institucionSlug ?? null, identificador]
  ) as [any[], any];
  return rows;
}

/**
 * Compatibilidad para consumidores internos que esperan una sola cuenta. El
 * login usa `buscarCuentasActivas` para detectar y rechazar ambigüedades.
 */
export async function buscarCuentaActiva(identificador: string, institucionSlug?: string) {
  const cuentas = await buscarCuentasActivas(identificador, institucionSlug);
  return cuentas[0] ?? null;
}

/**
 * Código vigente de esa cuenta: no usado y sin expirar. Solo puede haber uno,
 * porque `crear` invalida los anteriores.
 */
export async function buscarVigente(cedula: string, institucionId?: number | null): Promise<CodigoVigente | null> {
  const [rows] = await pool.query(
    `SELECT id_codigo, codigo_hash, intentos, expira_at, creado_at
       FROM codigo_acceso
      WHERE fk_cedula_estudiante = ?
        AND fk_id_institucion <=> ?
        AND usado_at IS NULL
        AND expira_at > NOW()
      ORDER BY id_codigo DESC
      LIMIT 1`,
    [cedula, institucionId ?? null]
  ) as [any[], any];
  return rows[0] ?? null;
}

/**
 * Emite un código nuevo e invalida cualquier otro que siguiera vigente, en una
 * transacción: en todo momento hay como mucho un código válido por cuenta. Sin
 * esto, pedir el código dos veces dejaría los dos funcionando y ampliaría la
 * ventana de un correo interceptado.
 */
export async function crear(
  cedula: string, codigoHash: string, vigenciaSegundos: number, ip: string | null, institucionId?: number | null
) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE codigo_acceso SET usado_at = NOW()
        WHERE fk_cedula_estudiante = ? AND fk_id_institucion <=> ? AND usado_at IS NULL`,
      [cedula, institucionId ?? null]
    );
    const [result] = await conn.query(
      `INSERT INTO codigo_acceso (fk_cedula_estudiante, codigo_hash, fk_id_institucion, expira_at, ip)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?)`,
      [cedula, codigoHash, institucionId ?? null, vigenciaSegundos, ip]
    ) as [any, any];

    await conn.commit();
    return Number(result.insertId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Suma un intento fallido. Devuelve cuántos lleva ya el código. */
export async function sumarIntento(idCodigo: number): Promise<number> {
  await pool.query(
    'UPDATE codigo_acceso SET intentos = intentos + 1 WHERE id_codigo = ?',
    [idCodigo]
  );
  const [rows] = await pool.query(
    'SELECT intentos FROM codigo_acceso WHERE id_codigo = ?',
    [idCodigo]
  ) as [any[], any];
  return Number(rows[0]?.intentos ?? 0);
}

/**
 * Marca el código como consumido. Devuelve si esta llamada fue la que lo
 * consumió: la condición `usado_at IS NULL` va en el UPDATE, así que dos
 * peticiones simultáneas con el mismo código solo dejan entrar a una.
 */
export async function consumir(idCodigo: number): Promise<boolean> {
  const [result] = await pool.query(
    'UPDATE codigo_acceso SET usado_at = NOW() WHERE id_codigo = ? AND usado_at IS NULL',
    [idCodigo]
  ) as [any, any];
  return Number(result.affectedRows) === 1;
}

/** Invalida todos los códigos vigentes de la cuenta (tras agotar los intentos). */
export async function invalidarTodos(cedula: string, institucionId?: number | null) {
  await pool.query(
    'UPDATE codigo_acceso SET usado_at = NOW() WHERE fk_cedula_estudiante = ? AND fk_id_institucion <=> ? AND usado_at IS NULL',
    [cedula, institucionId ?? null]
  );
}

/**
 * Borra los códigos caducados hace más de un día. Se llama de vez en cuando
 * desde la tarea programada: la tabla es de paso, no un histórico.
 */
export async function limpiarCaducados(): Promise<number> {
  const [result] = await pool.query(
    'DELETE FROM codigo_acceso WHERE expira_at < DATE_SUB(NOW(), INTERVAL 1 DAY)'
  ) as [any, any];
  return Number(result.affectedRows ?? 0);
}
