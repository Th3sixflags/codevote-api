import { z } from 'zod';

const FECHA      = /^\d{4}-\d{2}-\d{2}$/;
const FECHA_HORA = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const procesoBase = z.object({
  nombre_proceso:        z.string().min(1).max(120),
  tipo_proceso:          z.enum(['consejo_estudiantil', 'representante_carrera', 'referendum']),
  fecha_convocatoria:    z.string().regex(FECHA, 'Formato: YYYY-MM-DD'),
  fecha_inicio_votacion: z.string().regex(FECHA_HORA, 'Formato: YYYY-MM-DD HH:MM:SS'),
  fecha_fin_votacion:    z.string().regex(FECHA_HORA, 'Formato: YYYY-MM-DD HH:MM:SS'),
  estado:                z.enum(['planificado', 'convocado', 'inscripcion', 'campaña', 'votacion', 'escrutinio', 'finalizado', 'cancelado']).optional(),
  descripcion:           z.string().max(250).optional(),
  // Segmentación por carrera: null en procesos globales, obligatoria en los de
  // representante de carrera.
  fk_id_carrera:            z.union([z.number().int().positive(), z.null()]).optional(),
  // Periodo de inscripción de listas y posesión de los electos.
  fecha_inicio_inscripcion: z.union([z.string().regex(FECHA_HORA, 'Formato: YYYY-MM-DD HH:MM:SS'), z.null()]).optional(),
  fecha_fin_inscripcion:    z.union([z.string().regex(FECHA_HORA, 'Formato: YYYY-MM-DD HH:MM:SS'), z.null()]).optional(),
  fecha_posesion:           z.union([z.string().regex(FECHA_HORA, 'Formato: YYYY-MM-DD HH:MM:SS'), z.null()]).optional(),
});

type ProcesoParcial = z.infer<typeof procesoBase> extends infer T ? Partial<T> : never;

/**
 * Reglas de coherencia del proceso electoral. Se aplican tanto al crear como al
 * actualizar; en la actualización solo se comprueban los campos presentes.
 */
function reglas(v: ProcesoParcial, ctx: z.RefinementCtx) {
  // 1. Carrera según el tipo de proceso.
  if (v.tipo_proceso === 'representante_carrera') {
    if (v.fk_id_carrera === null || v.fk_id_carrera === undefined) {
      // En una actualización parcial solo se exige si se envía el tipo.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fk_id_carrera'],
        message: 'Un proceso de representante de carrera requiere indicar la carrera.',
      });
    }
  } else if (v.tipo_proceso && v.fk_id_carrera != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fk_id_carrera'],
      message: 'Un proceso global (consejo estudiantil o referéndum) no debe tener carrera.',
    });
  }

  // 2. Secuencia de fechas: convocatoria → inscripción → votación → posesión.
  //    El formato es fijo, así que comparar como texto respeta el orden.
  const convocatoria = v.fecha_convocatoria ? `${v.fecha_convocatoria} 00:00:00` : undefined;
  const secuencia: Array<[string, string | undefined | null]> = [
    ['fecha_convocatoria',       convocatoria],
    ['fecha_inicio_inscripcion', v.fecha_inicio_inscripcion],
    ['fecha_fin_inscripcion',    v.fecha_fin_inscripcion],
    ['fecha_inicio_votacion',    v.fecha_inicio_votacion],
    ['fecha_fin_votacion',       v.fecha_fin_votacion],
    ['fecha_posesion',           v.fecha_posesion],
  ];
  const presentes = secuencia.filter(([, valor]) => typeof valor === 'string') as Array<[string, string]>;
  for (let i = 1; i < presentes.length; i += 1) {
    const [campoAnterior, anterior] = presentes[i - 1];
    const [campo, actual] = presentes[i];
    if (actual < anterior) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [campo],
        message: `La secuencia de fechas debe ser convocatoria → inscripción → votación → posesión (${campo} no puede ser anterior a ${campoAnterior}).`,
      });
    }
  }
}

export const crearProcesoSchema      = procesoBase.superRefine(reglas);
export const actualizarProcesoSchema = procesoBase.partial().superRefine(reglas);

export type CrearProcesoDTO      = z.infer<typeof crearProcesoSchema>;
export type ActualizarProcesoDTO = z.infer<typeof actualizarProcesoSchema>;
