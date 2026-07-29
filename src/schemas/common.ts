import { z } from 'zod';

/**
 * Cédula ecuatoriana: exactamente 10 dígitos numéricos.
 *
 * Se valida el formato (solo números, longitud 10). No se aplica el algoritmo
 * del dígito verificador (módulo 10) para no rechazar cédulas de prueba; si se
 * quisiera exigir cédulas 100% reales, aquí es donde se añadiría esa lógica.
 */
export const cedulaSchema = z
  .string()
  .regex(/^\d{10}$/, 'La cédula debe tener exactamente 10 dígitos numéricos.');

/**
 * URL de una imagen alojada externamente. Se exige HTTPS para no degradar la
 * seguridad de la página con contenido mixto (http dentro de un sitio https).
 * Se acepta cadena vacía o null para quitar la imagen; ambas se normalizan a
 * null para guardarlas de forma consistente en la base.
 */
export const urlImagenHttpsSchema = z
  .union([z.string().max(255), z.null()])
  .refine((valor) => {
    if (valor === null || valor === '') return true;
    try {
      return new URL(valor).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'La imagen debe ser una URL válida que inicie con https://')
  .transform((valor) => (valor === '' ? null : valor));
