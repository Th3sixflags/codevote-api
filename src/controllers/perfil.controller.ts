import { Request, Response } from 'express';
import { actualizarFotoSchema } from '../schemas/perfil.schema.js';
import * as service from '../services/perfil.service.js';

/** PATCH /perfil/foto — actualiza la foto de perfil del usuario autenticado. */
export async function actualizarFoto(req: Request, res: Response) {
  const { foto_url } = actualizarFotoSchema.parse(req.body);
  const perfil = await service.actualizarFoto(req.user!.sub, foto_url, req.user?.fk_id_institucion);
  res.json(perfil);
}
