import { z } from 'zod';
import { cedulaSchema, nombrePersonaSchema } from './common.js';

export const crearEstudianteSchema = z.object({
  cedula:               cedulaSchema,
  nombres:              nombrePersonaSchema,
  apellidos:            nombrePersonaSchema,
  correo_institucional: z.string()
    .email('El correo institucional no tiene un formato válido.')
    .max(120),
  // `promedio` sobre 100. El .finite() descarta NaN e Infinity, que en JSON
  // llegarían como null pero por FormData podrían colarse.
  promedio:             z.number().finite().min(0, 'El promedio no puede ser negativo.').max(100, 'El promedio máximo es 100.').optional(),
  fecha_ingreso:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Debe ser una fecha en formato YYYY-MM-DD.').optional(),
  membresia_activa:     z.boolean().optional(),
  estado_academico:     z.enum(['activo', 'inactivo', 'egresado', 'graduado']).optional(),
  fk_id_carrera:        z.number().int().positive().optional(),
  rol:                  z.enum(['estudiante', 'admin', 'candidato']).optional(),
});

// El de actualización hereda el mismo enum (incluido 'candidato') al ser partial().
export const actualizarEstudianteSchema = crearEstudianteSchema.partial();

export type CrearEstudianteDTO      = z.infer<typeof crearEstudianteSchema>;
export type ActualizarEstudianteDTO = z.infer<typeof actualizarEstudianteSchema>;
