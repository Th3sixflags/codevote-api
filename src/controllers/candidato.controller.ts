import { Request, Response } from 'express';
import { crearCandidatoSchema, actualizarCandidatoSchema } from '../schemas/candidato.schema.js';
import * as service from '../services/candidato.service.js';

export async function listar(req: Request, res: Response) {
  const registros = await service.listarCandidato(req.user?.fk_id_institucion);
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerCandidato(Number(req.params.id), req.user?.fk_id_institucion);
  if (!registro) {
    res.status(404).json({ error: 'Candidato no encontrado.' });
    return;
  }
  res.json(registro);
}

export async function listarPorLista(req: Request, res: Response) {
  const registros = await service.listarPorLista(Number(req.params.listaId), req.user?.fk_id_institucion);
  res.json(registros);
}

export async function crear(req: Request, res: Response) {
  const data  = crearCandidatoSchema.parse(req.body);
  const nuevo = await service.crearCandidato(data, req.user?.fk_id_institucion);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarCandidatoSchema.parse(req.body);
  const actualizado = await service.actualizarCandidato(Number(req.params.id), data, req.user?.fk_id_institucion);
  if (!actualizado) {
    res.status(404).json({ error: 'Candidato no encontrado.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarCandidato(Number(req.params.id), req.user?.fk_id_institucion);
  if (!eliminado) {
    res.status(404).json({ error: 'Candidato no encontrado.' });
    return;
  }
  res.status(204).send();
}
