import { readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { rutasEnUso } from '../repositories/archivos_huerfanos.repository.js';
import { DIRECTORIO_UPLOADS, SUBRUTA_IMAGENES, SUBRUTA_PLANES } from '../config/uploads.js';

/**
 * Borra los archivos subidos que no acabaron referenciados por nadie.
 *
 * Por qué hacen falta: la imagen se sube al ELEGIR el archivo, no al guardar el
 * formulario. Es lo que permite ver la vista previa real y saber en el momento
 * si el archivo fue rechazado, pero significa que cancelar el formulario —o
 * cambiar de foto tres veces antes de guardar— deja archivos en disco que nadie
 * referencia. En un servidor pequeño ese goteo termina llenando el disco, y un
 * disco lleno no es una molestia: MySQL deja de aceptar escrituras y la votación
 * se cae.
 *
 * Reglas para no borrar nada que importe:
 *
 *   1. Solo se toca lo que está DENTRO de los directorios de subidas conocidos,
 *      y se comprueba que la ruta resuelta siga estando dentro.
 *   2. Solo archivos con más de HORAS_DE_GRACIA de antigüedad. Uno recién subido
 *      puede estar en un formulario abierto sin guardar todavía; borrarlo dejaría
 *      la foto rota justo al pulsar "Guardar".
 *   3. Solo si su nombre no aparece en NINGUNA columna que guarde archivos.
 *
 * Ante cualquier duda no se borra: perder una foto de perfil es peor que
 * conservar unos kilobytes de más.
 */

const HORAS_DE_GRACIA = 24;

export interface ResultadoLimpieza {
  revisados: number;
  borrados: number;
  bytesLiberados: number;
}

function limpiarDirectorio(
  directorio: string, enUso: Set<string>, corte: number
): ResultadoLimpieza {
  const resultado: ResultadoLimpieza = { revisados: 0, borrados: 0, bytesLiberados: 0 };

  let archivos: string[];
  try {
    archivos = readdirSync(directorio);
  } catch {
    return resultado; // el directorio aún no existe: nada que limpiar
  }

  for (const nombre of archivos) {
    resultado.revisados += 1;
    if (enUso.has(nombre)) continue;

    const ruta = path.join(directorio, nombre);
    // Defensa contra un nombre con "..": la ruta resuelta debe seguir dentro.
    if (!path.resolve(ruta).startsWith(path.resolve(directorio) + path.sep)) continue;

    try {
      const info = statSync(ruta);
      if (!info.isFile()) continue;
      // Se usa la fecha de modificación: es cuando terminó de escribirse.
      if (info.mtimeMs > corte) continue;

      unlinkSync(ruta);
      resultado.borrados += 1;
      resultado.bytesLiberados += info.size;
    } catch {
      // Un archivo que desaparece a mitad, o sin permisos: se ignora y se sigue.
    }
  }

  return resultado;
}

/** Recorre los directorios de subidas y borra lo que ya no referencia nadie. */
export async function limpiarArchivosHuerfanos(): Promise<ResultadoLimpieza> {
  const enUso = await rutasEnUso();
  const corte = Date.now() - HORAS_DE_GRACIA * 60 * 60 * 1000;

  const total: ResultadoLimpieza = { revisados: 0, borrados: 0, bytesLiberados: 0 };
  for (const subruta of [SUBRUTA_IMAGENES, SUBRUTA_PLANES]) {
    const parcial = limpiarDirectorio(path.join(DIRECTORIO_UPLOADS, subruta), enUso, corte);
    total.revisados += parcial.revisados;
    total.borrados += parcial.borrados;
    total.bytesLiberados += parcial.bytesLiberados;
  }
  return total;
}
