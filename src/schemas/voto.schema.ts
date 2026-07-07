import { z } from 'zod';

export const crearVotoSchema = z.object({
  fk_id_votacion: z.number().int().positive(),
  fk_id_lista:    z.number().int().positive().nullable(),
  tipo_voto:      z.enum(['valido', 'blanco', 'nulo']),
});

export type CrearVotoDTO = z.infer<typeof crearVotoSchema>;
