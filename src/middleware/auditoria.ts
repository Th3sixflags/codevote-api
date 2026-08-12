import type { NextFunction, Request, Response } from 'express';
import * as auditoria from '../repositories/auditoria.repository.js';

const METODOS_MUTACION = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Anexa una evidencia por cada mutación HTTP terminada. Nunca persiste el body,
 * tokens ni códigos OTP: la bitácora identifica quién hizo qué, dónde y con qué
 * resultado sin convertirse en una segunda base de datos sensible.
 */
export function auditarMutacionesHttp(req: Request, res: Response, next: NextFunction) {
  if (!METODOS_MUTACION.has(req.method)) {
    next();
    return;
  }

  res.once('finish', () => {
    const ruta = req.originalUrl.split('?')[0].slice(0, 255);
    void auditoria.registrar({
      actorCedula: req.user?.sub ?? null,
      actorRol: req.user?.rol ?? null,
      institucionId: req.user?.fk_id_institucion ?? null,
      idSesion: req.user?.jti ?? null,
      accion: `http.${req.method.toLowerCase()}`,
      metodo: req.method,
      ruta,
      estadoHttp: res.statusCode,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      detalles: { resultado: res.statusCode < 400 ? 'aceptado' : 'rechazado' },
    }).catch((err: any) => {
      // El despliegue del código puede preceder a la migración manual. No se
      // rompe la respuesta ya enviada; cualquier otro fallo queda visible.
      if (err?.code !== 'ER_NO_SUCH_TABLE' && err?.errno !== 1146) {
        console.error('[auditoria] no se pudo registrar el evento HTTP', err);
      }
    });
  });

  next();
}
