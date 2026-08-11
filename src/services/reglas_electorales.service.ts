import { configJsonSchema, InstitucionConfig } from '../schemas/institucion.schema.js';
import * as institucionRepo from '../repositories/institucion.repository.js';
import { HttpError } from '../utils/httpError.js';

export async function obtenerConfiguracionInstitucion(institucionId?: number): Promise<InstitucionConfig> {
  if (institucionId == null) {
    return configJsonSchema.parse({});
  }
  const institucion = await institucionRepo.findById(institucionId);
  if (!institucion) {
    return configJsonSchema.parse({});
  }
  return configJsonSchema.parse(institucion.config_json || {});
}

export function validarRequisitosCandidato(
  estudiante: any,
  config: InstitucionConfig,
  carreraExigida?: number | null,
  nombrePapeleta?: string
) {
  if (config.requiere_estado_activo) {
    if (estudiante.estado_academico !== 'activo') {
      throw new HttpError(409, 'El estudiante debe estar activo académicamente para participar.');
    }
  }

  if (config.requiere_membresia_activa) {
    if (estudiante.membresia_activa !== 1) {
      throw new HttpError(409, 'El estudiante debe tener su membresía activa al día para participar.');
    }
  }

  if (config.requiere_promedio && config.promedio_minimo != null) {
    if (estudiante.promedio == null || Number(estudiante.promedio) < config.promedio_minimo) {
      throw new HttpError(409, `El estudiante no cumple el promedio mínimo de ${config.promedio_minimo}/100 requerido para postularse.`);
    }
  }

  if (config.requiere_antiguedad && config.antiguedad_minima_meses != null) {
    if (!estudiante.fecha_ingreso) {
      throw new HttpError(409, `Se requiere al menos ${config.antiguedad_minima_meses} meses de antigüedad para participar y el estudiante no tiene registrada una fecha de ingreso.`);
    }
    const fechaIngreso = new Date(estudiante.fecha_ingreso);
    const ahora = new Date();
    const meses = (ahora.getFullYear() - fechaIngreso.getFullYear()) * 12 + (ahora.getMonth() - fechaIngreso.getMonth());
    if (meses < config.antiguedad_minima_meses) {
      throw new HttpError(409, `El estudiante no cumple con la antigüedad mínima de ${config.antiguedad_minima_meses} meses.`);
    }
  }

  if (config.requiere_carrera && carreraExigida != null) {
    const carreraIntegrante = estudiante.id_carrera ?? estudiante.fk_id_carrera ?? null;
    if (Number(carreraIntegrante) !== Number(carreraExigida)) {
      throw new HttpError(409, `Esta papeleta corresponde a la carrera "${nombrePapeleta ?? 'específica'}" y esa persona no pertenece a ella.`);
    }
  }
}
