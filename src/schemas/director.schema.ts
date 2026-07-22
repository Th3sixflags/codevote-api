import { z } from 'zod';

export const crearDirectorSchema = z.object({
  nombres:    z.string().min(1).max(80),
  apellidos:  z.string().min(1).max(80),
  correo:     z.string().email().max(120),
});

export const actualizarDirectorSchema = crearDirectorSchema.partial();

export type CrearDirectorDTO      = z.infer<typeof crearDirectorSchema>;
export type ActualizarDirectorDTO = z.infer<typeof actualizarDirectorSchema>;
