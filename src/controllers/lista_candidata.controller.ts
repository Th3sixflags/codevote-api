import { Request, Response } from 'express';
import { crearListaSchema, actualizarListaSchema } from '../schemas/lista_candidata.schema.js';
import * as service from '../services/lista_candidata.service.js';

export async function listar(_req: Request, res: Response) {
  const listas = await service.listarListas();
  res.json(listas);
}

export async function obtener(req: Request, res: Response) {
  const lista = await service.obtenerLista(Number(req.params.id));
  if (!lista) {
    res.status(404).json({ error: 'Lista no encontrada.' });
    return;
  }
  res.json(lista);
}

export async function listarPorProceso(req: Request, res: Response) {
  const listas = await service.listarPorProceso(Number(req.params.procesoId));
  res.json(listas);
}

export async function crear(req: Request, res: Response) {
  const data  = crearListaSchema.parse(req.body);
  const nueva = await service.crearLista(data);
  res.status(201).json(nueva);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarListaSchema.parse(req.body);
  const actualizada = await service.actualizarLista(Number(req.params.id), data);
  if (!actualizada) {
    res.status(404).json({ error: 'Lista no encontrada.' });
    return;
  }
  res.json(actualizada);
}

export async function eliminar(req: Request, res: Response) {
  const eliminada = await service.eliminarLista(Number(req.params.id));
  if (!eliminada) {
    res.status(404).json({ error: 'Lista no encontrada.' });
    return;
  }
  res.status(204).send();
}
