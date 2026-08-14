import { ahoraEnEcuador } from '../utils/zonaHoraria.js';
import * as repo from '../repositories/etapas_proceso.repository.js';

/**
 * Avanza todos los procesos electorales a las etapas tempranas ('convocado',
 * 'inscripcion', 'campaña') si han cruzado el umbral de tiempo configurado.
 *
 * Retorna la cantidad total de procesos que cambiaron de estado.
 */
export async function avanzarEtapasPrevias(): Promise<number> {
  const ahora = ahoraEnEcuador();
  const hoy = ahora.substring(0, 10);
  
  let totalModificados = 0;

  // 1. A convocado
  const convocados = await repo.avanzarAConvocado(hoy);
  if (convocados > 0) {
    console.info(`[etapas] ${convocados} proceso(s) pasaron a fase de CONVOCATORIA`);
    totalModificados += convocados;
  }

  // 2. A inscripcion
  const inscripciones = await repo.avanzarAInscripcion(ahora);
  if (inscripciones > 0) {
    console.info(`[etapas] ${inscripciones} proceso(s) pasaron a fase de INSCRIPCIÓN`);
    totalModificados += inscripciones;
  }

  // 3. A campaña
  const campana = await repo.avanzarACampana(ahora);
  if (campana > 0) {
    console.info(`[etapas] ${campana} proceso(s) pasaron a fase de CAMPAÑA`);
    totalModificados += campana;
  }

  return totalModificados;
}
