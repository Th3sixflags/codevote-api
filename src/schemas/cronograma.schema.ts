import { z } from 'zod';

// OJO con la barra invertida: dentro de un literal de expresión regular hay que
// escribir `\d`. Con `\\d` el patrón busca una barra invertida seguida de la
// letra "d", así que no coincidía con ninguna fecha real y el endpoint
// rechazaba con 422 todo cronograma, incluso bien formado.
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const cronogramaBase = z.object({
  fk_id_proceso:      z.number().int().positive(),
  fk_id_responsable:  z.number().int().positive(),
  actividad:          z.string().min(1).max(120),
  fecha_inicio:       z.string().regex(FECHA, 'Formato: YYYY-MM-DD'),
  fecha_fin:          z.string().regex(FECHA, 'Formato: YYYY-MM-DD'),
});

/**
 * Una actividad no puede terminar antes de empezar. Como el formato es fijo
 * (YYYY-MM-DD), comparar como texto respeta el orden cronológico.
 * En la actualización solo se comprueba si llegan ambas fechas.
 */
const finNoAnterior = (v: { fecha_inicio?: string; fecha_fin?: string }) =>
  !v.fecha_inicio || !v.fecha_fin || v.fecha_fin >= v.fecha_inicio;

const mensajeFin = {
  message: 'La fecha de fin no puede ser anterior a la de inicio.',
  path: ['fecha_fin'],
};

export const crearCronogramaSchema      = cronogramaBase.refine(finNoAnterior, mensajeFin);
export const actualizarCronogramaSchema = cronogramaBase.partial().refine(finNoAnterior, mensajeFin);

export type CrearCronogramaDTO      = z.infer<typeof crearCronogramaSchema>;
export type ActualizarCronogramaDTO = z.infer<typeof actualizarCronogramaSchema>;
