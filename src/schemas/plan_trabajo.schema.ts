import { z } from 'zod';
import { archivoPlanSchema } from './common.js';

export const crearPlanTrabajoSchema = z.object({
  area:         z.enum(['academico', 'deportivo', 'cultural', 'infraestructura', 'social']),
  propuesta:    z.string().min(1),
  archivo_url:  archivoPlanSchema.optional(),
  fk_id_lista:  z.number().int().positive(),
});

export const actualizarPlanTrabajoSchema = crearPlanTrabajoSchema.partial();

export type CrearPlanTrabajoDTO      = z.infer<typeof crearPlanTrabajoSchema>;
export type ActualizarPlanTrabajoDTO = z.infer<typeof actualizarPlanTrabajoSchema>;
