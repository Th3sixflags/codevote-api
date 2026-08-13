import { pool } from '../config/database.js';

function tablaNoExiste(err: any): boolean {
  return err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146;
}

export async function crearSiEstaDisponible(datos: {
  idSesion: string;
  cedula: string;
  expiraAt: Date;
  ip: string | null;
  userAgent: string | null;
}): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO sesion
         (id_sesion, fk_cedula_estudiante, expira_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [datos.idSesion, datos.cedula, datos.expiraAt, datos.ip, datos.userAgent]
    );
    return true;
  } catch (err) {
    if (tablaNoExiste(err)) return false;
    throw err;
  }
}

export async function tablaDisponible(): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesion' LIMIT 1`
  ) as [any[], any];
  return rows.length > 0;
}

/** Comprueba revocación, caducidad y que la cuenta siga activa. */
export async function estaActiva(idSesion: string, cedula: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT 1
       FROM sesion s
       JOIN estudiante e ON e.cedula = s.fk_cedula_estudiante
      WHERE s.id_sesion = ?
        AND s.fk_cedula_estudiante = ?
        AND s.revocada_at IS NULL
        AND s.expira_at > NOW()
        AND e.estado_academico = 'activo'
      LIMIT 1`,
    [idSesion, cedula]
  ) as [any[], any];
  if (rows.length === 0) return false;

  // Reduce escrituras: una sesión usada continuamente se marca como máximo
  // una vez cada cinco minutos.
  await pool.query(
    `UPDATE sesion SET ultimo_uso_at = NOW()
      WHERE id_sesion = ? AND ultimo_uso_at < NOW() - INTERVAL 5 MINUTE`,
    [idSesion]
  );
  return true;
}

export async function revocar(idSesion: string, cedula: string, motivo = 'logout'): Promise<boolean> {
  const [result] = await pool.query(
    `UPDATE sesion
        SET revocada_at = COALESCE(revocada_at, NOW()),
            motivo_revocacion = COALESCE(motivo_revocacion, ?)
      WHERE id_sesion = ? AND fk_cedula_estudiante = ? AND revocada_at IS NULL`,
    [motivo, idSesion, cedula]
  ) as [any, any];
  return Number(result.affectedRows) > 0;
}

export async function revocarTodas(
  cedula: string, exceptoId?: string, motivo = 'logout_todos'
): Promise<number> {
  const params: any[] = [motivo, cedula];
  const excepcion = exceptoId ? ' AND id_sesion <> ?' : '';
  if (exceptoId) params.push(exceptoId);
  const [result] = await pool.query(
    `UPDATE sesion
        SET revocada_at = NOW(), motivo_revocacion = ?
      WHERE fk_cedula_estudiante = ? AND revocada_at IS NULL${excepcion}`,
    params
  ) as [any, any];
  return Number(result.affectedRows ?? 0);
}

export async function guardarRefresh(idSesion: string, hash: string, expiraAt: Date) {
  await pool.query(
    `INSERT INTO sesion_refresh (id_sesion, token_hash, expira_at)
     VALUES (?, ?, ?)`,
    [idSesion, hash, expiraAt]
  );
}

/** Consume el refresh una sola vez. La fila queda marcada antes de emitir otra sesión. */
export async function consumirRefresh(hash: string) {
  const [rows] = await pool.query(
    `SELECT r.id_sesion, s.fk_cedula_estudiante
       FROM sesion_refresh r
       JOIN sesion s ON s.id_sesion = r.id_sesion
      WHERE r.token_hash = ?
        AND r.usado_at IS NULL
        AND r.expira_at > NOW()
        AND s.revocada_at IS NULL
      FOR UPDATE`,
    [hash]
  ) as [any[], any];
  const fila = rows[0];
  if (!fila) return null;
  const [result] = await pool.query(
    'UPDATE sesion_refresh SET usado_at = NOW() WHERE token_hash = ? AND usado_at IS NULL',
    [hash]
  ) as [any, any];
  return Number(result.affectedRows) === 1 ? fila : null;
}
