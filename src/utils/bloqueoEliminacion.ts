/**
 * Reglas de eliminación de registros electorales.
 *
 * Un registro se puede eliminar definitivamente solo mientras siga siendo un
 * BORRADOR: sus dependencias son de preparación (listas, candidatos, planes,
 * validaciones, votaciones, cronogramas) y se pueden limpiar en una transacción.
 *
 * En cuanto aparece ACTIVIDAD ELECTORAL —votos, comprobantes, actas de
 * resultados o registros de veeduría— el registro deja de ser borrable: es
 * evidencia electoral y solo puede cancelarse o archivarse. Por eso no se usa
 * ON DELETE CASCADE global en el esquema: borraría esa evidencia sin aviso.
 */

export interface ActividadElectoral {
  votos?: boolean;
  comprobantes?: boolean;
  actas?: boolean;
  veedurias?: boolean;
}

export interface EstadoEliminacion {
  puede_eliminar: boolean;
  motivo_bloqueo: string | null;
}

/** Convierte "a", "b", "c" en "a, b y c". */
function enumerar(partes: string[]): string {
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/** Traduce las banderas de actividad electoral a un motivo legible. */
export function calcularBloqueo(actividad: ActividadElectoral): EstadoEliminacion {
  const partes: string[] = [];
  if (actividad.votos)        partes.push('votos');
  if (actividad.comprobantes) partes.push('comprobantes');
  if (actividad.actas)        partes.push('actas de resultados');
  if (actividad.veedurias)    partes.push('veedurías');

  if (partes.length === 0) return { puede_eliminar: true, motivo_bloqueo: null };

  // Se usa "Ya registra …" para que la frase concuerde sea cual sea el último
  // elemento (votos/comprobantes son masculinos, actas/veedurías femeninos).
  return {
    puede_eliminar: false,
    motivo_bloqueo: `Ya registra ${enumerar(partes)}. Solo se puede cancelar o archivar.`,
  };
}

/** Normaliza los 0/1 que devuelve MySQL en los EXISTS a booleanos. */
export function bandera(valor: unknown): boolean {
  return Number(valor) === 1;
}
