import { z } from 'zod';

export const crearInstitucionSchema = z.object({
  nombre:         z.string().min(2).max(255),
  slug:           z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'El slug solo admite letras minúsculas, números y guiones').optional(),
  tipo:           z.string().default('universidad'),
  logo_url:       z.string().url().optional().or(z.literal('')),
  descripcion:    z.string().optional(),
  email_contacto: z.string().email().optional().or(z.literal('')),
  telefono:       z.string().optional(),
  direccion:      z.string().optional(),
  sitio_web:      z.string().url().optional().or(z.literal('')),
  dominio_email:  z.string().optional(),
  colores_json:   z.record(z.string()).optional(),
  config_json:    z.record(z.unknown()).optional(),
});

export const actualizarInstitucionSchema = crearInstitucionSchema.partial();

export type CrearInstitucionDTO      = z.infer<typeof crearInstitucionSchema>;
export type ActualizarInstitucionDTO = z.infer<typeof actualizarInstitucionSchema>;
