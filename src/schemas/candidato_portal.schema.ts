import { z } from 'zod';
import { cedulaSchema, urlImagenHttpsSchema } from './common.js';

// Esquemas de entrada del portal del candidato. Reutilizan los mismos enums de
// cargo y área que el resto del sistema, pero NO permiten fijar la lista ni el
// dueño desde el body: esos se derivan de la ruta y del token.

const CARGO = z.enum(['presidente', 'vicepresidente', 'secretario', 'tesorero', 'vocal']);
const AREA  = z.enum(['academico', 'deportivo', 'cultural', 'infraestructura', 'social']);

export const crearListaCandidatoSchema = z.object({
  // El candidato elige la papeleta (categoría) en la que compite. El proceso y
  // la carrera se derivan de ella: no se vuelven a pedir.
  fk_id_votacion: z.number().int().positive(),
  nombre_lista:   z.string().min(1).max(80),
  lema:           z.string().max(120).optional(),
  foto_url:       urlImagenHttpsSchema.optional(),
});

export const actualizarListaCandidatoSchema = z.object({
  nombre_lista: z.string().min(1).max(80).optional(),
  lema:         z.string().max(120).optional(),
  foto_url:     urlImagenHttpsSchema.optional(),
});

export const agregarCandidatoSchema = z.object({
  cargo:                CARGO,
  fk_cedula_estudiante: cedulaSchema,
  foto_url:             z.string().max(255).optional(),
});

export const actualizarCandidatoPortalSchema = z.object({
  cargo:    CARGO.optional(),
  foto_url: z.string().max(255).optional(),
});

export const agregarPlanSchema = z.object({
  area:        AREA,
  propuesta:   z.string().min(1),
  archivo_url: z.string().max(255).optional(),
});

export const actualizarPlanSchema = z.object({
  area:        AREA.optional(),
  propuesta:   z.string().min(1).optional(),
  archivo_url: z.string().max(255).optional(),
});

export type CrearListaCandidatoDTO      = z.infer<typeof crearListaCandidatoSchema>;
export type ActualizarListaCandidatoDTO = z.infer<typeof actualizarListaCandidatoSchema>;
export type AgregarCandidatoDTO         = z.infer<typeof agregarCandidatoSchema>;
export type ActualizarCandidatoPortalDTO = z.infer<typeof actualizarCandidatoPortalSchema>;
export type AgregarPlanDTO              = z.infer<typeof agregarPlanSchema>;
export type ActualizarPlanDTO           = z.infer<typeof actualizarPlanSchema>;
