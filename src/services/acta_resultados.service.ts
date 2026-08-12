import * as repo from '../repositories/acta_resultados.repository.js';
import { CrearActaResultadosDTO, ActualizarActaResultadosDTO } from '../schemas/acta_resultados.schema.js';
import { hashActaEsValido } from '../utils/hashActa.js';

export async function listarActaResultados(institucionId?: number) {
  return repo.findAll(institucionId);
}

export async function obtenerActaResultados(id: number, institucionId?: number) {
  const registro = await repo.findById(id, institucionId);
  return registro ?? null;
}

export async function listarPorVotacion(id: number, institucionId?: number) {
  return repo.findByVotacion(id, institucionId);
}

export async function verificarIntegridad(id: number, institucionId?: number) {
  const acta = await repo.findIntegridadById(id, institucionId);
  if (!acta) return null;
  const valida = hashActaEsValido({
    votacionId: Number(acta.fk_id_votacion),
    totalVotantes: Number(acta.total_votantes),
    validos: Number(acta.votos_validos),
    blancos: Number(acta.votos_blanco),
    nulos: Number(acta.votos_nulos),
    ganadora: acta.lista_ganadora == null ? null : String(acta.lista_ganadora),
    fechaEmision: String(acta.fecha_emision),
  }, String(acta.hash_acta));
  return {
    id_acta: Number(acta.id_acta),
    hash_version: Number(acta.hash_version),
    hash_algoritmo: String(acta.hash_algoritmo),
    hash_acta: String(acta.hash_acta),
    integridad: valida ? 'valida' : 'invalida',
  };
}

export async function crearActaResultados(data: CrearActaResultadosDTO, institucionId?: number) {
  return repo.create(data);
}

export async function actualizarActaResultados(id: number, data: ActualizarActaResultadosDTO, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarActaResultados(id: number, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
