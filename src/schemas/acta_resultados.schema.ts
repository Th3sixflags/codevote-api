import { z } from 'zod';

export const crearActaResultadosSchema = z.object({
  fk_id_votacion:  z.number().int().positive(),
  total_votantes:  z.number().int().min(0).optional(),
  votos_validos:   z.number().int().min(0).optional(),
  votos_blanco:    z.number().int().min(0).optional(),
  votos_nulos:     z.number().int().min(0).optional(),
  lista_ganadora:  z.string().max(80).optional(),
  fecha_emision:   z.string().regex(/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/, 'Formato: YYYY-MM-DD HH:MM:SS').optional(),
});

export const actualizarActaResultadosSchema = crearActaResultadosSchema.partial();

export type CrearActaResultadosDTO      = z.infer<typeof crearActaResultadosSchema>;
export type ActualizarActaResultadosDTO = z.infer<typeof actualizarActaResultadosSchema>;
