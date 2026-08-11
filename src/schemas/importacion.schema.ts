import { z } from 'zod';
import { nombrePersonaSchema } from './common.js';

export const filaCsvSchema = z.object({
  identificador: z.string().min(1, 'El identificador no puede estar vacío.').max(20, 'El identificador no puede exceder 20 caracteres.'),
  nombres: nombrePersonaSchema,
  apellidos: nombrePersonaSchema,
  correo: z.string().email('Formato de correo inválido.').max(120),
  division: z.string().optional(),
  estado: z.enum(['activo', 'inactivo', 'egresado', 'graduado']).optional().default('activo'),
  fecha_ingreso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Debe ser una fecha en formato YYYY-MM-DD.').optional(),
  membresia_activa: z.union([z.boolean(), z.string().regex(/^(true|false|1|0|si|no)$/i)]).optional(),
});

export const confirmarImportacionSchema = z.object({
  previewToken: z.string().uuid('Token de previsualización inválido.'),
});

export type FilaCsvDTO = z.infer<typeof filaCsvSchema>;
export type ConfirmarImportacionDTO = z.infer<typeof confirmarImportacionSchema>;
