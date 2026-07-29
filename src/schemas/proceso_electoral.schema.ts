import { z } from 'zod';

const procesoBase = z.object({
  nombre_proceso:        z.string().min(1).max(120),
  tipo_proceso:          z.enum(['consejo_estudiantil', 'representante_carrera', 'referendum']),
  fecha_convocatoria:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato: YYYY-MM-DD'),
  fecha_inicio_votacion: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'Formato: YYYY-MM-DD HH:MM:SS'),
  fecha_fin_votacion:    z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'Formato: YYYY-MM-DD HH:MM:SS'),
  estado:                z.enum(['planificado', 'convocado', 'inscripcion', 'campaña', 'votacion', 'escrutinio', 'finalizado', 'cancelado']).optional(),
  descripcion:           z.string().max(250).optional(),
});

// El fin de votación debe ser posterior al inicio (formato fijo => comparar como texto sirve).
const finPosterior = (v: { fecha_inicio_votacion?: string; fecha_fin_votacion?: string }) =>
  !v.fecha_inicio_votacion || !v.fecha_fin_votacion || v.fecha_fin_votacion > v.fecha_inicio_votacion;
const mensajeFin = { message: 'El fin de votación debe ser posterior al inicio.', path: ['fecha_fin_votacion'] };

export const crearProcesoSchema      = procesoBase.refine(finPosterior, mensajeFin);
export const actualizarProcesoSchema = procesoBase.partial().refine(finPosterior, mensajeFin);

export type CrearProcesoDTO      = z.infer<typeof crearProcesoSchema>;
export type ActualizarProcesoDTO = z.infer<typeof actualizarProcesoSchema>;
