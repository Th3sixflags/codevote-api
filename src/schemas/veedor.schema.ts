import { z } from 'zod';

export const crearVeedorSchema = z.object({
  nombre:       z.string().min(1).max(100),
  institucion:  z.string().max(100).optional(),
  tipo_veedor:  z.enum(['interno', 'externo', 'docente', 'estudiante']),
  correo:       z.string().email().max(120),
});

export const actualizarVeedorSchema = crearVeedorSchema.partial();

export type CrearVeedorDTO      = z.infer<typeof crearVeedorSchema>;
export type ActualizarVeedorDTO = z.infer<typeof actualizarVeedorSchema>;
