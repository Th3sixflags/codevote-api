import { z } from 'zod';
import { nombrePersonaSchema } from './common.js';

export const crearDirectorSchema = z.object({
  nombres:    nombrePersonaSchema,
  apellidos:  nombrePersonaSchema,
  correo:     z.string().email('El correo no tiene un formato válido.').max(120),
});

export const actualizarDirectorSchema = crearDirectorSchema.partial();

export type CrearDirectorDTO      = z.infer<typeof crearDirectorSchema>;
export type ActualizarDirectorDTO = z.infer<typeof actualizarDirectorSchema>;
