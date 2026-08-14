import { z } from 'zod';
import { esCedulaEcuatorianaValida } from './common.js';

/**
 * Entrada del login por código.
 *
 * El identificador admite las dos formas con las que la persona se reconoce:
 * su correo institucional o su cédula. Se valida que sea una de las dos para no
 * consultar la base con cualquier texto, pero el mensaje de error no dice cuál
 * de las dos falló ni si existe: eso lo resuelve el servicio con una respuesta
 * uniforme.
 */
export const identificadorSchema = z
  .string()
  .trim()
  .min(1, 'Escribe tu correo institucional o tu cédula.')
  .max(120)
  .refine(
    (valor) => {
      if (valor.includes('@')) {
        return z.string().email().safeParse(valor).success;
      }
      return esCedulaEcuatorianaValida(valor);
    },
    'Escribe un correo electrónico válido o tu cédula de 10 dígitos.'
  );

/** Slug público de la institución, usado para desambiguar una cédula. */
export const institucionSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'La institución indicada no es válida.');

export const solicitarCodigoSchema = z.object({
  identificador: identificadorSchema,
  institucion_slug: institucionSlugSchema.optional(),
}).strict();

export const verificarCodigoSchema = z.object({
  identificador: identificadorSchema,
  institucion_slug: institucionSlugSchema.optional(),
  // Se aceptan espacios y guiones porque al pegar el código desde el correo
  // suelen colarse; se limpian antes de comparar.
  codigo: z
    .string()
    .transform((valor) => valor.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, 'El código tiene 6 dígitos.')),
}).strict();

export type SolicitarCodigoDTO = z.infer<typeof solicitarCodigoSchema>;
export type VerificarCodigoDTO = z.infer<typeof verificarCodigoSchema>;
