import { z } from 'zod';

export const crearCodigoVotoSchema = z.object({
  fk_id_votacion:        z.number().int().positive(),
  codigo_hash:           z.string().min(1).max(255),
  estado_codigo:         z.enum(['generado', 'enviado', 'usado', 'expirado']).optional(),
  fecha_envio:           z.string().regex(/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/, 'Formato: YYYY-MM-DD HH:MM:SS').optional(),
  fk_cedula_estudiante:  z.string().length(10),
});

export const actualizarCodigoVotoSchema = crearCodigoVotoSchema.partial();

export type CrearCodigoVotoDTO      = z.infer<typeof crearCodigoVotoSchema>;
export type ActualizarCodigoVotoDTO = z.infer<typeof actualizarCodigoVotoSchema>;
