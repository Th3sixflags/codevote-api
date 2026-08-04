import { z } from 'zod';
import { cedulaSchema, urlImagenHttpsSchema, cargoSchema } from './common.js';

// Esquemas de entrada del portal del candidato. Reutilizan los mismos enums de
// cargo y área que el resto del sistema, pero NO permiten fijar la lista ni el
// dueño desde el body: esos se derivan de la ruta y del token.

const CARGO = cargoSchema;
const AREA  = z.enum(['academico', 'deportivo', 'cultural', 'infraestructura', 'social']);

export const crearListaCandidatoSchema = z.object({
  // La papeleta NO se acepta desde el cliente: se toma de la asignación que el
  // administrador hizo al candidato (ver asignacion_candidatura). El proceso y
  // la carrera se derivan de ella.
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

/**
 * Propuestas (planes de trabajo) desde el Portal del candidato.
 *
 * `archivo_url` NO se acepta en el cuerpo: el respaldo tiene que ser un PDF
 * subido a CodeVote, y la única vía para escribirlo es
 * `POST /api/candidato/listas/:listaId/planes/archivo`, que valida el tipo
 * (application/pdf) y el tamaño (10 MB). Los esquemas son `.strict()` para que
 * enviar `archivo_url` —por ejemplo una URL https:// externa— se rechace con 422
 * en vez de ignorarse en silencio, que era lo que hacía Zod al descartar las
 * claves desconocidas.
 */
export const agregarPlanSchema = z.object({
  area:      AREA,
  propuesta: z.string().min(1),
}).strict('El PDF de la propuesta no se envía aquí: súbelo con POST /api/candidato/listas/:listaId/planes/archivo.');

export const actualizarPlanSchema = z.object({
  area:      AREA.optional(),
  propuesta: z.string().min(1).optional(),
}).strict('El PDF de la propuesta no se envía aquí: súbelo con POST /api/candidato/listas/:listaId/planes/archivo.');

export type CrearListaCandidatoDTO      = z.infer<typeof crearListaCandidatoSchema>;
export type ActualizarListaCandidatoDTO = z.infer<typeof actualizarListaCandidatoSchema>;
export type AgregarCandidatoDTO         = z.infer<typeof agregarCandidatoSchema>;
export type ActualizarCandidatoPortalDTO = z.infer<typeof actualizarCandidatoPortalSchema>;
export type AgregarPlanDTO              = z.infer<typeof agregarPlanSchema>;
export type ActualizarPlanDTO           = z.infer<typeof actualizarPlanSchema>;
