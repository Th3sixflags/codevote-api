import { z } from 'zod';

export const crearRequisitoSchema = z.object({
  nombre_requisito:  z.string().min(1).max(100),
  descripcion:       z.string().max(250).optional(),
  tipo_requisito:    z.string().min(1).max(40),
});

export const actualizarRequisitoSchema = crearRequisitoSchema.partial();

export type CrearRequisitoDTO      = z.infer<typeof crearRequisitoSchema>;
export type ActualizarRequisitoDTO = z.infer<typeof actualizarRequisitoSchema>;
