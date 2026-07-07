import { Request, Response } from 'express';
import { crearVotoSchema } from '../schemas/voto.schema';
import * as service from '../services/voto.service';

export async function votar(req: Request, res: Response) {
  const data = crearVotoSchema.parse(req.body);
  try {
    const voto = await service.registrarVoto(data);
    res.status(201).json(voto);
  } catch (err: any) {
    throw err;
  }
}

export async function resultados(req: Request, res: Response) {
  const resultados = await service.obtenerResultados(Number(req.params.votacionId));
  res.json(resultados);
}
