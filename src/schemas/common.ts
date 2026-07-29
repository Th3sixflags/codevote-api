import { z } from 'zod';

/**
 * Cédula ecuatoriana: exactamente 10 dígitos numéricos.
 *
 * Se valida el formato (solo números, longitud 10). No se aplica el algoritmo
 * del dígito verificador (módulo 10) para no rechazar cédulas de prueba; si se
 * quisiera exigir cédulas 100% reales, aquí es donde se añadiría esa lógica.
 */
/**
 * Valida una cédula ecuatoriana completa (algoritmo del Registro Civil):
 *  1. 10 dígitos numéricos.
 *  2. Los dos primeros son el código de provincia: 01–24, o 30 (exterior).
 *  3. El tercer dígito debe ser menor que 6 (persona natural).
 *  4. El décimo es el dígito verificador, calculado por módulo 10 sobre los
 *     nueve primeros con los coeficientes 2,1,2,1,2,1,2,1,2 (restando 9 a los
 *     productos mayores que 9).
 */
export function esCedulaEcuatorianaValida(cedula: string): boolean {
  if (!/^\d{10}$/.test(cedula)) return false;

  const provincia = Number(cedula.slice(0, 2));
  if (provincia < 1 || (provincia > 24 && provincia !== 30)) return false;
  if (Number(cedula[2]) > 5) return false;

  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i += 1) {
    const producto = Number(cedula[i]) * coeficientes[i];
    suma += producto > 9 ? producto - 9 : producto;
  }
  const verificador = (10 - (suma % 10)) % 10;
  return verificador === Number(cedula[9]);
}

export const cedulaSchema = z
  .string()
  .regex(/^\d{10}$/, 'La cédula debe tener exactamente 10 dígitos numéricos.')
  .refine(esCedulaEcuatorianaValida, 'La cédula no es válida: revisa el número (dígito verificador incorrecto).');

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
