import { Request, Response } from 'express';
import * as service from '../services/candidato_portal.service.js';
import {
  crearListaCandidatoSchema, actualizarListaCandidatoSchema,
  agregarCandidatoSchema, actualizarCandidatoPortalSchema,
  agregarPlanSchema, actualizarPlanSchema,
} from '../schemas/candidato_portal.schema.js';

/** GET /candidato/mi-lista */
export async function miLista(req: Request, res: Response) {
  const lista = await service.obtenerMiLista(req.user!.sub);
  res.json(lista); // null si aún no tiene lista
}

/** POST /candidato/listas */
export async function crearLista(req: Request, res: Response) {
  const data  = crearListaCandidatoSchema.parse(req.body);
  const lista = await service.crearLista(req.user!.sub, data);
  res.status(201).json(lista);
}

/** PATCH /candidato/listas/:id */
export async function actualizarLista(req: Request, res: Response) {
  const data  = actualizarListaCandidatoSchema.parse(req.body);
  const lista = await service.actualizarLista(req.user!.sub, Number(req.params.id), data);
  res.json(lista);
}

/** POST /candidato/listas/:id/candidatos */
export async function agregarCandidato(req: Request, res: Response) {
  const data      = agregarCandidatoSchema.parse(req.body);
  const candidato = await service.agregarCandidato(req.user!.sub, Number(req.params.id), data);
  res.status(201).json(candidato);
}

/** PATCH /candidato/candidatos/:id */
export async function actualizarCandidato(req: Request, res: Response) {
  const data      = actualizarCandidatoPortalSchema.parse(req.body);
  const candidato = await service.actualizarCandidato(req.user!.sub, Number(req.params.id), data);
  res.json(candidato);
}

/** DELETE /candidato/candidatos/:id */
export async function eliminarCandidato(req: Request, res: Response) {
  await service.eliminarCandidato(req.user!.sub, Number(req.params.id));
  res.status(204).send();
}

/** POST /candidato/listas/:id/planes */
export async function agregarPlan(req: Request, res: Response) {
  const data = agregarPlanSchema.parse(req.body);
  const plan = await service.agregarPlan(req.user!.sub, Number(req.params.id), data);
  res.status(201).json(plan);
}

/** PATCH /candidato/planes/:id */
export async function actualizarPlan(req: Request, res: Response) {
  const data = actualizarPlanSchema.parse(req.body);
  const plan = await service.actualizarPlan(req.user!.sub, Number(req.params.id), data);
  res.json(plan);
}

/** POST /candidato/listas/:id/enviar-revision */
export async function enviarARevision(req: Request, res: Response) {
  const lista = await service.enviarARevision(req.user!.sub, Number(req.params.id));
  res.json(lista);
}
