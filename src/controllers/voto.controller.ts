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

export async function resultados(req: Request, res: Response) {
  const resultados = await service.obtenerResultados(Number(req.params.votacionId));
  res.json(resultados);
}
