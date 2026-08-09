import { z } from 'zod';

export const crearInstitucionSchema = z.object({
  nombre:         z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(255),
  tipo:           z.string().default('universidad'),
  logo_url:       z.string().url('El logo debe ser una URL válida').optional().or(z.literal('')),
  descripcion:    z.string().optional(),
  email_contacto: z.string().email('Debe ser un correo válido').optional().or(z.literal('')),
  telefono:       z.string().optional(),
  direccion:      z.string().optional(),
  sitio_web:      z.string().url('El sitio web debe ser una URL válida').optional().or(z.literal('')),
  dominio_email:  z.string().optional(),
  config:         z.record(z.unknown()).optional(),
});

export const actualizarInstitucionSchema = crearInstitucionSchema.partial();

export type CrearInstitucionDTO      = z.infer<typeof crearInstitucionSchema>;
export type ActualizarInstitucionDTO = z.infer<typeof actualizarInstitucionSchema>;
