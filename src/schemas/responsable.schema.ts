import { z } from 'zod';
import { nombrePersonaSchema } from './common.js';

export const crearResponsableSchema = z.object({
  nombres:    nombrePersonaSchema,
  apellidos:  nombrePersonaSchema,
  cargo:      z.string().max(60).optional(),
  correo:     z.string().email('El correo no tiene un formato válido.').max(120),
});

export const actualizarResponsableSchema = crearResponsableSchema.partial();

export type CrearResponsableDTO      = z.infer<typeof crearResponsableSchema>;
export type ActualizarResponsableDTO = z.infer<typeof actualizarResponsableSchema>;
