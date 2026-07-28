import { Request, Response } from 'express';
import { crearVotoSchema } from '../schemas/voto.schema.js';
import * as service from '../services/voto.service.js';

export async function votar(req: Request, res: Response) {
  const data = crearVotoSchema.parse(req.body);
  const cedula = req.user!.sub;

  // Un estudiante solo puede votar una vez por votación.
  if (await service.yaVoto(data.fk_id_votacion, cedula)) {
    res.status(409).json({ error: 'Ya has emitido tu voto en esta votación.' });
    return;
  }

  try {
    const voto = await service.registrarVoto(data, cedula);
    res.status(201).json(voto);
  } catch (err: any) {
    // Carrera: dos peticiones simultáneas. La restricción única de codigo_voto
    // rechaza la segunda; se responde con el mismo 409 que la comprobación previa.
    if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
      res.status(409).json({ error: 'Ya has emitido tu voto en esta votación.' });
      return;
    }
    throw err;
  }
}

// Roles que pueden ver resultados en cualquier momento.
const ROLES_PRIVILEGIADOS = ['admin', 'administrador', 'junta_electoral'];

export async function resultados(req: Request, res: Response) {
  const votacionId = Number(req.params.votacionId);
  const rol = String(req.user?.rol ?? '').toLowerCase();

  // Los estudiantes solo pueden ver resultados si la votación está cerrada
  // o el proceso ya finalizó (para no revelar quién va ganando antes de tiempo).
  if (!ROLES_PRIVILEGIADOS.includes(rol)) {
    const estado = await service.estadoResultados(votacionId);
    if (estado) {
      const disponible = estado.votacion === 'cerrada' || estado.proceso === 'finalizado';
      if (!disponible) {
        res.status(403).json({ error: 'Los resultados estarán disponibles cuando finalice la votación.' });
        return;
      }
    }
  }

  const resultados = await service.obtenerResultados(votacionId);
  res.json(resultados);
}
