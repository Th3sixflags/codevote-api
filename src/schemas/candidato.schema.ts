import { z } from 'zod';
import { cedulaSchema, cargoSchema, urlImagenHttpsSchema } from './common.js';

export const crearCandidatoSchema = z.object({
  cargo:                 cargoSchema,
  cumple_requisitos:     z.boolean().optional(),
  foto_url:              urlImagenHttpsSchema.optional(),
  fk_cedula_estudiante:  cedulaSchema,
  fk_id_lista:           z.number().int().positive(),
});

export const actualizarCandidatoSchema = crearCandidatoSchema.partial();

export type CrearCandidatoDTO      = z.infer<typeof crearCandidatoSchema>;
export type ActualizarCandidatoDTO = z.infer<typeof actualizarCandidatoSchema>;
