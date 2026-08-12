import { z } from 'zod';
import { cedulaSchema, nombrePersonaSchema } from './common.js';

export const configJsonSchema = z.object({
  requiere_promedio: z.boolean().default(false),
  promedio_minimo: z.number().min(0).max(100).optional(),
  requiere_carrera: z.boolean().default(false),
  requiere_antiguedad: z.boolean().default(false),
  antiguedad_minima_meses: z.number().int().min(1).optional(),
  requiere_estado_activo: z.boolean().default(false),
  requiere_membresia_activa: z.boolean().default(false),
});

export type InstitucionConfig = z.infer<typeof configJsonSchema>;

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
  config_json:    configJsonSchema.partial().optional(),
});

export const actualizarInstitucionSchema = crearInstitucionSchema.partial();

export const asignarAdminSchema = z.object({
  cedula:               z.string().min(3, 'El identificador debe tener al menos 3 caracteres').max(20),
  nombres:              nombrePersonaSchema,
  apellidos:            nombrePersonaSchema,
  correo_institucional: z.string().email('El correo institucional no tiene un formato válido.').max(120),
});

export type CrearInstitucionDTO      = z.infer<typeof crearInstitucionSchema>;
export type ActualizarInstitucionDTO = z.infer<typeof actualizarInstitucionSchema>;
export type AsignarAdminDTO          = z.infer<typeof asignarAdminSchema>;
