import { z } from 'zod';

/**
 * Recordatorio que la administración programa a mano.
 *
 * `fk_id_votacion` es opcional: sin él, el mensaje va a todo el padrón del
 * proceso; con él, solo al de esa papeleta (y, si `solo_pendientes` sigue en
 * true, únicamente a quienes todavía no han votado).
 */
export const crearRecordatorioSchema = z.object({
  fk_id_proceso:   z.number().int().positive(),
  fk_id_votacion:  z.number().int().positive().nullable().optional(),
  asunto:          z.string().trim().min(4, 'El asunto es muy corto.').max(150),
  mensaje:         z.string().trim().min(10, 'Escribe un mensaje de al menos 10 caracteres.').max(1000),
  // 'YYYY-MM-DDTHH:mm' o 'YYYY-MM-DD HH:mm[:ss]', en hora de Ecuador. Se
  // normaliza al formato que entiende MySQL.
  programado_para: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, 'Indica la fecha y hora del envío.')
    .transform((valor) => {
      const normalizado = valor.replace('T', ' ');
      return normalizado.length === 16 ? `${normalizado}:00` : normalizado;
    }),
  solo_pendientes: z.boolean().optional(),
}).strict();

export const resolverSancionSchema = z.object({
  // No se admite 'activa': una sanción se resuelve justificándola o anulándola,
  // no se reactiva.
  estado:      z.enum(['justificada', 'anulada']),
  observacion: z.string().trim().max(250).optional(),
}).strict();

export type CrearRecordatorioDTO = z.infer<typeof crearRecordatorioSchema>;
export type ResolverSancionDTO   = z.infer<typeof resolverSancionSchema>;
