/**
 * Hora de Ecuador, sin depender del reloj del contenedor.
 *
 * Las fechas del proceso electoral se guardan en columnas DATETIME, que no
 * llevan zona horaria: son "hora de Ecuador" por convención. Si se comparasen
 * con la hora local del contenedor —que en Docker suele ser UTC— una votación
 * se cerraría cinco horas antes de tiempo.
 *
 * Por eso el "ahora" con el que se compara se calcula siempre en
 * America/Guayaquil de forma explícita. Ecuador continental no aplica horario
 * de verano (UTC-5 todo el año), pero se usa `Intl` con el nombre de la zona en
 * lugar de restar cinco horas a mano: si la regla cambiara, esto seguiría bien.
 */

export const ZONA_ECUADOR = 'America/Guayaquil';

const FORMATO = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZONA_ECUADOR,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

/**
 * Instante dado, expresado como 'YYYY-MM-DD HH:mm:ss' en hora de Ecuador.
 *
 * Es el formato que MySQL entiende para comparar contra un DATETIME, así que
 * el valor se pasa como parámetro a la consulta y la comparación no depende ni
 * de la zona del contenedor ni de la de la sesión de MySQL.
 *
 * El locale 'sv-SE' se usa porque su formato nativo ya es ISO (2026-08-03
 * 14:05:00); no tiene nada que ver con Suecia más allá de esa comodidad.
 */
export function ahoraEnEcuador(momento: Date = new Date()): string {
  return FORMATO.format(momento).replace(' ', ' ').replace('T', ' ');
}

/** Igual que `ahoraEnEcuador`, pero legible para una persona: 03/08/2026 14:05. */
export function formatearEnEcuador(valor: Date | string): string {
  const fecha = valor instanceof Date ? valor : new Date(String(valor).replace(' ', 'T'));
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: ZONA_ECUADOR,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).format(fecha);
}
