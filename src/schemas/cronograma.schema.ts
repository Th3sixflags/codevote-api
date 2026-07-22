import { z } from 'zod';

export const crearCronogramaSchema = z.object({
  fk_id_proceso:      z.number().int().positive(),
  fk_id_responsable:  z.number().int().positive(),
  actividad:          z.string().min(1).max(120),
  fecha_inicio:       z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/, 'Formato: YYYY-MM-DD'),
  fecha_fin:          z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/, 'Formato: YYYY-MM-DD'),
});

export const actualizarCronogramaSchema = crearCronogramaSchema.partial();

export type CrearCronogramaDTO      = z.infer<typeof crearCronogramaSchema>;
export type ActualizarCronogramaDTO = z.infer<typeof actualizarCronogramaSchema>;
