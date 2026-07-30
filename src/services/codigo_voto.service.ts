import * as repo from '../repositories/codigo_voto.repository.js';
import { CrearCodigoVotoDTO, ActualizarCodigoVotoDTO } from '../schemas/codigo_voto.schema.js';

/**
 * Lista blanca de lo que puede salir por los endpoints de administración de
 * comprobantes. La respuesta se arma campo por campo, en vez de reenviar la
 * fila de MySQL, para que sigan siendo anónimos aunque alguien agregue columnas
 * o un JOIN a la consulta: lo que no esté aquí, no sale.
 *
 * Nunca: cédula, nombres, apellidos, correo, lista seleccionada, candidato ni
 * opción votada. `codigo_hash` y `codigo_verificacion` sí, porque son
 * identificadores opacos que no revelan identidad ni elección.
 */
function aComprobanteAnonimo(registro: any) {
  return {
    id_codigo:           registro.id_codigo,
    titulo_papeleta:     registro.titulo_papeleta,
    codigo_hash:         registro.codigo_hash,
    codigo_verificacion: registro.codigo_verificacion,
    estado_codigo:       registro.estado_codigo,
    fecha_envio:         registro.fecha_envio,
  };
}

export async function listarCodigoVoto() {
  const registros = await repo.findAll();
  return registros.map(aComprobanteAnonimo);
}

export async function obtenerCodigoVoto(id: number) {
  const registro = await repo.findById(id);
  return registro ? aComprobanteAnonimo(registro) : null;
}

export async function listarPorVotacion(id: number) {
  const registros = await repo.findByVotacion(id);
  return registros.map(aComprobanteAnonimo);
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

// Crear y actualizar también responden con el comprobante, así que pasan por la
// misma lista blanca: la cédula viaja en el body de entrada, pero no vuelve.
export async function crearCodigoVoto(data: CrearCodigoVotoDTO) {
  const nuevo = await repo.create(data);
  return nuevo ? aComprobanteAnonimo(nuevo) : null;
}

export async function actualizarCodigoVoto(id: number, data: ActualizarCodigoVotoDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  const actualizado = await repo.update(id, data);
  return actualizado ? aComprobanteAnonimo(actualizado) : null;
}

export async function eliminarCodigoVoto(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
