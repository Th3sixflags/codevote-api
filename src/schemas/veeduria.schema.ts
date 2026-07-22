import { z } from 'zod';

export const crearVeeduriaSchema = z.object({
  fk_id_votacion:  z.number().int().positive(),
  fk_id_veedor:    z.number().int().positive(),
  momento:         z.enum(['apertura', 'desarrollo', 'cierre', 'escrutinio']),
  observacion:     z.string().max(250).optional(),
});

export const actualizarVeeduriaSchema = crearVeeduriaSchema.partial();

export type CrearVeeduriaDTO      = z.infer<typeof crearVeeduriaSchema>;
export type ActualizarVeeduriaDTO = z.infer<typeof actualizarVeeduriaSchema>;
