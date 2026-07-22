import { Request, Response } from 'express';
import { crearCandidatoSchema, actualizarCandidatoSchema } from '../schemas/candidato.schema';
import * as service from '../services/candidato.service';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarCandidato();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerCandidato(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Candidato no encontrado.' });
    return;
  }
  res.json(registro);
}

export async function listarPorLista(req: Request, res: Response) {
  const registros = await service.listarPorLista(Number(req.params.listaId));
  res.json(registros);
}

export async function crear(req: Request, res: Response) {
  const data  = crearCandidatoSchema.parse(req.body);
  const nuevo = await service.crearCandidato(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarCandidatoSchema.parse(req.body);
  const actualizado = await service.actualizarCandidato(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Candidato no encontrado.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarCandidato(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Candidato no encontrado.' });
    return;
  }
  res.status(204).send();
}
