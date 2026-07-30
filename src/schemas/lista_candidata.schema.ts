import { z } from 'zod';
import { urlImagenHttpsSchema } from './common.js';

export const crearListaSchema = z.object({
  // La lista compite en una papeleta concreta; el proceso se deriva de ella.
  fk_id_votacion:    z.number().int().positive(),
  nombre_lista:      z.string().min(1).max(80),
  lema:              z.string().max(120).optional(),
  estado_revision:   z.string().max(30).optional(),
  fecha_inscripcion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato: YYYY-MM-DD'),
  foto_url:          urlImagenHttpsSchema.optional(),
});

export const actualizarListaSchema = crearListaSchema.partial();

// Al rechazar una lista, el administrador debe indicar el motivo (se conserva
// para auditoría y para que el candidato sepa qué corregir).
export const rechazarListaSchema = z.object({
  motivo: z.string().min(1, 'Debe indicar el motivo del rechazo.').max(250),
});

export type CrearListaDTO      = z.infer<typeof crearListaSchema>;
export type ActualizarListaDTO = z.infer<typeof actualizarListaSchema>;
export type RechazarListaDTO   = z.infer<typeof rechazarListaSchema>;
