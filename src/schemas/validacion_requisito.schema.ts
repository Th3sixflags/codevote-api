import { z } from 'zod';

export const crearValidacionRequisitoSchema = z.object({
  cumple:            z.boolean().optional(),
  observacion:       z.string().max(250).optional(),
  fecha_validacion:  z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/, 'Formato: YYYY-MM-DD'),
  fk_id_candidato:   z.number().int().positive(),
  fk_id_requisito:   z.number().int().positive(),
});

export const actualizarValidacionRequisitoSchema = crearValidacionRequisitoSchema.partial();

export type CrearValidacionRequisitoDTO      = z.infer<typeof crearValidacionRequisitoSchema>;
export type ActualizarValidacionRequisitoDTO = z.infer<typeof actualizarValidacionRequisitoSchema>;
