import { z } from 'zod';

export const crearVotacionSchema = z.object({
  fk_id_proceso:   z.number().int().positive(),
  titulo_papeleta: z.string().min(1).max(120),
  fecha_apertura:  z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'Formato: YYYY-MM-DD HH:MM:SS'),
  fecha_cierre:    z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'Formato: YYYY-MM-DD HH:MM:SS'),
  estado:          z.enum(['pendiente', 'abierta', 'cerrada']).optional(),
});

export const actualizarVotacionSchema = crearVotacionSchema.partial();

export type CrearVotacionDTO      = z.infer<typeof crearVotacionSchema>;
export type ActualizarVotacionDTO = z.infer<typeof actualizarVotacionSchema>;
