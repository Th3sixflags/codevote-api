import { z } from 'zod';

export const crearProcesoSchema = z.object({
  nombre_proceso:        z.string().min(1).max(120),
  tipo_proceso:          z.enum(['consejo_estudiantil', 'representante_carrera', 'referendum']),
  fecha_convocatoria:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato: YYYY-MM-DD'),
  fecha_inicio_votacion: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'Formato: YYYY-MM-DD HH:MM:SS'),
  fecha_fin_votacion:    z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'Formato: YYYY-MM-DD HH:MM:SS'),
  estado:                z.enum(['planificado', 'convocado', 'inscripcion', 'campaña', 'votacion', 'escrutinio', 'finalizado', 'cancelado']).optional(),
  descripcion:           z.string().max(250).optional(),
});

export const actualizarProcesoSchema = crearProcesoSchema.partial();

export type CrearProcesoDTO      = z.infer<typeof crearProcesoSchema>;
export type ActualizarProcesoDTO = z.infer<typeof actualizarProcesoSchema>;
