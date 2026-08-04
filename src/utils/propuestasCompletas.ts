import { HttpError } from './httpError.js';
import { RUTA_PDF_SUBIDO } from '../schemas/common.js';

/**
 * Cuándo una candidatura tiene su programa en regla.
 *
 * Una lista no puede llegar a revisión —ni, por tanto, aprobarse— con el
 * programa a medias: la administración no tendría qué revisar y los estudiantes
 * votarían una propuesta vacía. Las condiciones son tres:
 *
 *   1. Al menos UNA propuesta.
 *   2. Cada propuesta con su área y su resumen (`propuesta`).
 *   3. Cada propuesta con su PDF SUBIDO A CODEVOTE (`/api/uploads/planes/*.pdf`).
 *      Un enlace externo no vale: puede cambiar, caducar o pedir permisos que la
 *      administración no tiene al revisarla.
 *
 * La comprobación se hace en dos momentos —al enviar a revisión y al aprobar—
 * porque la lista sigue siendo editable mientras está `en_revision`: sin la
 * segunda, bastaría con añadir una propuesta vacía después de enviarla para que
 * una lista aprobada terminara con propuestas sin PDF.
 */

/** Un plan de trabajo, tal como sale del repositorio. */
interface Propuesta {
  id_plan?: number | string;
  area?: unknown;
  propuesta?: unknown;
  archivo_url?: unknown;
}

const vacio = (valor: unknown) => String(valor ?? '').trim() === '';

/** Qué le falta a esta propuesta, en lenguaje llano. Vacío si está completa. */
function carencias(p: Propuesta): string[] {
  const faltan: string[] = [];
  if (vacio(p.area))      faltan.push('el área');
  if (vacio(p.propuesta)) faltan.push('el resumen');
  if (vacio(p.archivo_url) || !RUTA_PDF_SUBIDO.test(String(p.archivo_url))) {
    faltan.push('el PDF subido a CodeVote');
  }
  return faltan;
}

/** Convierte "a", "b", "c" en "a, b y c". */
function enumerar(partes: string[]): string {
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/**
 * Lanza 409 si el programa no está completo, con un mensaje que IDENTIFICA cada
 * propuesta incompleta (su id y su área) y dice qué le falta, para que el
 * candidato sepa exactamente qué corregir.
 *
 * @param accion  Qué se estaba intentando ("enviar la lista a revisión").
 */
export function verificarPropuestasCompletas(propuestas: Propuesta[], accion: string) {
  if (propuestas.length === 0) {
    throw new HttpError(
      409,
      `No se puede ${accion}: la lista no tiene ninguna propuesta. `
      + 'Agrega al menos una con su área, su resumen y su PDF.'
    );
  }

  const incompletas = propuestas
    .map((p) => ({ p, faltan: carencias(p) }))
    .filter(({ faltan }) => faltan.length > 0);

  if (incompletas.length === 0) return;

  const detalle = incompletas
    .map(({ p, faltan }) => {
      const nombre = vacio(p.area) ? `Propuesta ${p.id_plan}` : `Propuesta ${p.id_plan} (${p.area})`;
      return `${nombre}: falta ${enumerar(faltan)}`;
    })
    .join('; ');

  throw new HttpError(
    409,
    `No se puede ${accion}: hay ${incompletas.length === 1 ? 'una propuesta incompleta' : `${incompletas.length} propuestas incompletas`}. ${detalle}.`
  );
}
