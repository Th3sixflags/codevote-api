import { z } from 'zod';

export const crearVotoSchema = z
  .object({
    fk_id_votacion: z.number().int().positive(),
    fk_id_lista:    z.number().int().positive().nullable(),
    tipo_voto:      z.enum(['valido', 'blanco', 'nulo']),
  })
  // Un voto 'valido' debe llevar una lista; los votos en blanco o nulos NO.
  .refine(
    (v) => (v.tipo_voto === 'valido' ? v.fk_id_lista != null : v.fk_id_lista == null),
    {
      message: 'Un voto válido requiere una lista; los votos en blanco o nulos no deben llevar lista.',
      path: ['fk_id_lista'],
    }
  );

export type CrearVotoDTO = z.infer<typeof crearVotoSchema>;
