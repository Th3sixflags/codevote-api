import * as repo from '../repositories/codigo_voto.repository.js';
import { CrearCodigoVotoDTO, ActualizarCodigoVotoDTO } from '../schemas/codigo_voto.schema.js';

/**
 * Lista blanca de lo que puede salir por los endpoints de administración de
 * comprobantes. La respuesta se arma campo por campo, en vez de reenviar la
 * fila de MySQL, para que sigan siendo anónimos aunque alguien agregue columnas
 * o un JOIN a la consulta: lo que no esté aquí, no sale.
 *
 * Nunca: cédula, nombres, apellidos, correo, lista seleccionada, candidato ni
 * opción votada, hashes, códigos de verificación ni IDs internos. Los códigos
 * públicos se entregan únicamente al propio elector por "Mis recibos".
 */
function aComprobanteAnonimo(registro: any) {
  return {
    titulo_papeleta:     registro.titulo_papeleta,
    estado_codigo:       registro.estado_codigo,
    fecha_envio:         registro.fecha_envio,
  };
}

export async function listarCodigoVoto(institucionId?: number) {
  const registros = await repo.findAll(institucionId);
  return registros.map(aComprobanteAnonimo);
}

export async function obtenerCodigoVoto(id: number, institucionId?: number) {
  const registro = await repo.findById(id, institucionId);
  return registro ? aComprobanteAnonimo(registro) : null;
}

export async function listarPorVotacion(id: number, institucionId?: number) {
  const registros = await repo.findByVotacion(id, institucionId);
  return registros.map(aComprobanteAnonimo);
}

export async function listarPorEstudiante(cedula: string, institucionId?: number) {
  const registros = await repo.findByEstudiante(cedula, institucionId);
  // Lista blanca separada del resultado SQL: `fk_cedula_estudiante` solo se usa
  // en WHERE y nunca llega al navegador, ni siquiera al propio elector.
  return registros.map((registro: any) => ({
    fk_id_votacion: registro.fk_id_votacion,
    titulo_papeleta: registro.titulo_papeleta,
    nombre_proceso: registro.nombre_proceso,
    estado_codigo: registro.estado_codigo,
    fecha_envio: registro.fecha_envio,
    codigo_verificacion: registro.codigo_verificacion,
  }));
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

/**
 * Contrato público mínimo: no se expone el código, IDs internos, hash,
 * identidad del elector ni información de la opción emitida.
 */
export async function verificarComprobantePublico(codigoVerificacion: string) {
  const registro = await repo.findVerificacionPublica(codigoVerificacion);
  if (!registro) return null;

  return {
    valido: true,
    proceso: registro.nombre_proceso,
    papeleta: registro.titulo_papeleta,
    fecha_registro: registro.fecha_envio,
    estado: 'registrado',
  };
}

// Crear y actualizar también responden con el comprobante, así que pasan por la
// misma lista blanca: la cédula viaja en el body de entrada, pero no vuelve.
export async function crearCodigoVoto(data: CrearCodigoVotoDTO, institucionId?: number) {
  const nuevo = await repo.create(data);
  return nuevo ? aComprobanteAnonimo(nuevo) : null;
}

export async function actualizarCodigoVoto(id: number, data: ActualizarCodigoVotoDTO, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return null;
  const actualizado = await repo.update(id, data);
  return actualizado ? aComprobanteAnonimo(actualizado) : null;
}

export async function eliminarCodigoVoto(id: number, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
