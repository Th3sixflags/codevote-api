import { z } from 'zod';

export const crearEstudianteSchema = z.object({
  cedula:               z.string().length(10),
  nombres:              z.string().min(1).max(80),
  apellidos:            z.string().min(1).max(80),
  correo_institucional: z.string().email().max(120),
  promedio:             z.number().min(0).max(10).optional(),
  estado_academico:     z.enum(['activo', 'inactivo', 'egresado', 'graduado']).optional(),
  fk_id_carrera:        z.number().int().positive().optional(),
  password:             z.string().min(6),
});

export const actualizarEstudianteSchema = crearEstudianteSchema.partial();

export type CrearEstudianteDTO      = z.infer<typeof crearEstudianteSchema>;
export type ActualizarEstudianteDTO = z.infer<typeof actualizarEstudianteSchema>;
