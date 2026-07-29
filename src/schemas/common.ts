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
