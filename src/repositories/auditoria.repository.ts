import { createHash } from 'node:crypto';
import { pool } from '../config/database.js';

export interface EventoAuditoria {
  actorCedula?: string | null;
  actorRol?: string | null;
  institucionId?: number | null;
  idSesion?: string | null;
  accion: string;
  metodo?: string | null;
  ruta?: string | null;
  estadoHttp?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  detalles?: Record<string, unknown> | null;
}

/** El hash cubre exactamente el contenido persistido, con claves en orden fijo. */
export function hashEvento(evento: EventoAuditoria): string {
  const canonico = JSON.stringify({
    actor_cedula: evento.actorCedula ?? null,
    actor_rol: evento.actorRol ?? null,
    fk_id_institucion: evento.institucionId ?? null,
    id_sesion: evento.idSesion ?? null,
    accion: evento.accion,
    metodo: evento.metodo ?? null,
    ruta: evento.ruta ?? null,
    estado_http: evento.estadoHttp ?? null,
    ip: evento.ip ?? null,
    user_agent: evento.userAgent ?? null,
    detalles: evento.detalles ?? null,
  });
  return createHash('sha256').update(canonico, 'utf8').digest('hex');
}

export async function registrar(evento: EventoAuditoria): Promise<void> {
  const detalles = evento.detalles ? JSON.stringify(evento.detalles) : null;
  await pool.query(
    `INSERT INTO auditoria_evento
       (actor_cedula, actor_rol, fk_id_institucion, id_sesion, accion, metodo,
        ruta, estado_http, ip, user_agent, detalles, hash_evento)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      evento.actorCedula ?? null,
      evento.actorRol ?? null,
      evento.institucionId ?? null,
      evento.idSesion ?? null,
      evento.accion,
      evento.metodo ?? null,
      evento.ruta ?? null,
      evento.estadoHttp ?? null,
      evento.ip ?? null,
      evento.userAgent?.slice(0, 255) ?? null,
      detalles,
      hashEvento(evento),
    ]
  );
}
