import { z } from 'zod';

export const crearFacultadSchema = z.object({
  nombre_facultad:  z.string().min(1).max(100),
});

export const actualizarFacultadSchema = crearFacultadSchema.partial();

export type CrearFacultadDTO      = z.infer<typeof crearFacultadSchema>;
export type ActualizarFacultadDTO = z.infer<typeof actualizarFacultadSchema>;
