import { z } from 'zod';

// El admin solo indica la papeleta: la cédula viene en la ruta y el proceso y la
// carrera se derivan de la votación.
export const asignarCandidaturaSchema = z.object({
  fk_id_votacion: z.number().int().positive(),
});

export type AsignarCandidaturaDTO = z.infer<typeof asignarCandidaturaSchema>;
