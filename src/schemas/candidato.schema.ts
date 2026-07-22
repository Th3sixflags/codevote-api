import { z } from 'zod';

export const crearCandidatoSchema = z.object({
  cargo:                 z.enum(['presidente', 'vicepresidente', 'secretario', 'tesorero', 'vocal']),
  cumple_requisitos:     z.boolean().optional(),
  foto_url:              z.string().max(255).optional(),
  fk_cedula_estudiante:  z.string().length(10),
  fk_id_lista:           z.number().int().positive(),
});

export const actualizarCandidatoSchema = crearCandidatoSchema.partial();

export type CrearCandidatoDTO      = z.infer<typeof crearCandidatoSchema>;
export type ActualizarCandidatoDTO = z.infer<typeof actualizarCandidatoSchema>;
