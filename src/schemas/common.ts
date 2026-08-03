import { z } from 'zod';

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
 * Nombre o apellido de una persona.
 *
 * Antes era un `string().min(1)`, así que "12345" pasaba como nombre válido. Se
 * admiten letras (con tildes y ñ), espacios, apóstrofos y guiones —"D'Angelo",
 * "Pérez-Mora"— pero ningún dígito. Los espacios sobrantes se recortan y los
 * internos se colapsan para que "Juan   Carlos" y "Juan Carlos" se guarden
 * igual.
 */
const LETRAS_NOMBRE = /^[\p{L}][\p{L}\p{M}'’\- ]*$/u;

export const nombrePersonaSchema = z
  .string()
  .transform((valor) => valor.trim().replace(/\s+/g, ' '))
  .pipe(
    z.string()
      .min(2, 'Debe tener al menos 2 caracteres.')
      .max(80, 'No puede superar los 80 caracteres.')
      .regex(LETRAS_NOMBRE, 'Solo se admiten letras, espacios, apóstrofos y guiones: no puede contener números ni símbolos.')
  );

/**
 * Cargos de un integrante dentro de una lista.
 *
 * 'Presidente' está reservado al RESPONSABLE de la candidatura: es el único con
 * rol 'candidato' y acceso al Portal del candidato. El resto de integrantes se
 * registra en la tabla `candidato` conservando su rol 'estudiante'.
 *
 * Los valores viajan capitalizados (así están en el ENUM de la base). Se acepta
 * la grafía antigua en minúsculas y se normaliza, para no romper a los clientes
 * que todavía envían 'presidente'.
 */
export const CARGOS = ['Presidente', 'Vicepresidente', 'Secretario', 'Tesorero', 'Vocal'] as const;
export type Cargo = (typeof CARGOS)[number];

export const CARGO_PRESIDENTE: Cargo = 'Presidente';

/** Cargos que puede ocupar un integrante que no es el responsable. */
export const CARGOS_SECUNDARIOS = CARGOS.filter((c) => c !== CARGO_PRESIDENTE);

/** Normaliza 'presidente' / 'PRESIDENTE' a 'Presidente'. Deja intacto lo demás. */
export function normalizarCargo(valor: unknown): unknown {
  if (typeof valor !== 'string') return valor;
  return CARGOS.find((c) => c.toLowerCase() === valor.trim().toLowerCase()) ?? valor;
}

export const cargoSchema = z.preprocess(normalizarCargo, z.enum(CARGOS));

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

/**
 * Documento de respaldo de un plan de trabajo.
 *
 * Antes era `z.string().max(255)`, es decir, cualquier texto. Por eso en
 * producción apareció un plan con `archivo_url = 'aprobada'`: el formulario
 * ofrece un campo de URL libre y lo que se escriba se guarda tal cual. Solo se
 * admiten tres formas:
 *
 *   - vacío o null (el plan aún no tiene documento),
 *   - la ruta que genera la propia subida de PDF: /api/uploads/planes/<archivo>.pdf,
 *   - una URL https:// válida (por ejemplo un documento alojado fuera).
 */
const RUTA_PDF_SUBIDO = /^\/api\/uploads\/planes\/[\w.-]+\.pdf$/i;

export const archivoPlanSchema = z
  .union([z.string().max(255), z.null()])
  .refine((valor) => {
    if (valor === null || valor === '') return true;
    if (RUTA_PDF_SUBIDO.test(valor)) return true;
    try {
      return new URL(valor).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'El documento debe ser una URL https:// válida o un PDF subido desde el portal. Déjalo vacío si aún no tienes documento.')
  .transform((valor) => (valor === '' ? null : valor));
