import { z } from 'zod';

export const crearCarreraSchema = z.object({
  nombre_carrera:  z.string().min(1).max(100),
  fk_id_director:  z.number().int().positive().optional(),
  fk_id_facultad:  z.number().int().positive().optional(),
});

export const actualizarCarreraSchema = crearCarreraSchema.partial();

export type CrearCarreraDTO      = z.infer<typeof crearCarreraSchema>;
export type ActualizarCarreraDTO = z.infer<typeof actualizarCarreraSchema>;
