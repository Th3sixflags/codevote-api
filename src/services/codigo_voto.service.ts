import * as repo from '../repositories/codigo_voto.repository.js';
import { CrearCodigoVotoDTO, ActualizarCodigoVotoDTO } from '../schemas/codigo_voto.schema.js';

export async function listarCodigoVoto() {
  return repo.findAll();
}

export async function obtenerCodigoVoto(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function listarPorVotacion(id: number) {
  return repo.findByVotacion(id);
}

export async function listarPorEstudiante(cedula: string) {
  return repo.findByEstudiante(cedula);
}

/**
 * Verifica un comprobante propio: confirma que la participación quedó
 * registrada. Devuelve null si el comprobante no existe o no es del estudiante
 * (el controlador responde 404 en ambos casos, para no filtrar la existencia de
 * comprobantes ajenos). La respuesta nunca incluye identidad, hash ni la opción
 * votada, que además no está ligada al comprobante.
 */
export async function verificarMiComprobante(id: number, cedula: string) {
  const registro = await repo.findVerificacionDeEstudiante(id, cedula);
  if (!registro) return null;

  return {
    valido: true,
    codigo_verificacion: registro.codigo_verificacion,
    proceso: registro.nombre_proceso,
    papeleta: registro.titulo_papeleta,
    fecha_registro: registro.fecha_envio,
    estado: 'registrado',
  };
}

export async function crearCodigoVoto(data: CrearCodigoVotoDTO) {
  return repo.create(data);
}

export async function actualizarCodigoVoto(id: number, data: ActualizarCodigoVotoDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarCodigoVoto(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
