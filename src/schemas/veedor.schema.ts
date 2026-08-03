import { z } from 'zod';
import { nombrePersonaSchema } from './common.js';

export const crearVeedorSchema = z.object({
  nombre:       nombrePersonaSchema,
  institucion:  z.string().max(100).optional(),
  tipo_veedor:  z.enum(['interno', 'externo', 'docente', 'estudiante']),
  correo:       z.string().email('El correo no tiene un formato válido.').max(120),
});

export const actualizarVeedorSchema = crearVeedorSchema.partial();

export type CrearVeedorDTO      = z.infer<typeof crearVeedorSchema>;
export type ActualizarVeedorDTO = z.infer<typeof actualizarVeedorSchema>;
