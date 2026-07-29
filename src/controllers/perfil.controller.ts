import { Request, Response } from 'express';
import { actualizarFotoSchema, cambiarPasswordSchema } from '../schemas/perfil.schema.js';
import * as service from '../services/perfil.service.js';

/** PATCH /perfil/foto — actualiza la foto de perfil del usuario autenticado. */
export async function actualizarFoto(req: Request, res: Response) {
  const { foto_url } = actualizarFotoSchema.parse(req.body);
  const perfil = await service.actualizarFoto(req.user!.sub, foto_url);
  res.json(perfil);
}

/** PATCH /perfil/password — cambia la contraseña del usuario autenticado. */
export async function cambiarPassword(req: Request, res: Response) {
  const { password_actual, password_nueva } = cambiarPasswordSchema.parse(req.body);
  await service.cambiarPassword(req.user!.sub, password_actual, password_nueva);
  res.json({ mensaje: 'Contraseña actualizada correctamente.' });
}
