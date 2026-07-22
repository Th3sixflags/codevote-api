import { z } from 'zod';

export const crearResponsableSchema = z.object({
  nombres:    z.string().min(1).max(80),
  apellidos:  z.string().min(1).max(80),
  cargo:      z.string().max(60).optional(),
  correo:     z.string().email().max(120),
});

export const actualizarResponsableSchema = crearResponsableSchema.partial();

export type CrearResponsableDTO      = z.infer<typeof crearResponsableSchema>;
export type ActualizarResponsableDTO = z.infer<typeof actualizarResponsableSchema>;
