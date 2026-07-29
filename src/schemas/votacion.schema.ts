import { z } from 'zod';

const votacionBase = z.object({
  fk_id_proceso:   z.number().int().positive(),
  titulo_papeleta: z.string().min(1).max(120),
  fecha_apertura:  z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'Formato: YYYY-MM-DD HH:MM:SS'),
  fecha_cierre:    z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'Formato: YYYY-MM-DD HH:MM:SS'),
  estado:          z.enum(['pendiente', 'abierta', 'cerrada']).optional(),
});

// El cierre debe ser posterior a la apertura (formato fijo => comparar como texto sirve).
const cierrePosterior = (v: { fecha_apertura?: string; fecha_cierre?: string }) =>
  !v.fecha_apertura || !v.fecha_cierre || v.fecha_cierre > v.fecha_apertura;
const mensajeCierre = { message: 'La fecha de cierre debe ser posterior a la de apertura.', path: ['fecha_cierre'] };

export const crearVotacionSchema      = votacionBase.refine(cierrePosterior, mensajeCierre);
export const actualizarVotacionSchema = votacionBase.partial().refine(cierrePosterior, mensajeCierre);

export type CrearVotacionDTO      = z.infer<typeof crearVotacionSchema>;
export type ActualizarVotacionDTO = z.infer<typeof actualizarVotacionSchema>;
