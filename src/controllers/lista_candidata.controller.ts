import { Request, Response } from 'express';
import {
  crearListaSchema, actualizarListaSchema, rechazarListaSchema,
  transferirResponsableSchema,
} from '../schemas/lista_candidata.schema.js';
import * as service from '../services/lista_candidata.service.js';
import { filtroCarreraDe } from '../utils/accesoCarrera.js';

export async function listar(req: Request, res: Response) {
  const listas = await service.listarListas(await filtroCarreraDe(req));
  res.json(listas);
}

export async function obtener(req: Request, res: Response) {
  // Una lista de un proceso de otra carrera se responde como no encontrada.
  const lista = await service.obtenerLista(Number(req.params.id), await filtroCarreraDe(req));
  if (!lista) {
    res.status(404).json({ error: 'Lista no encontrada.' });
    return;
  }
  res.json(lista);
}

export async function listarPorProceso(req: Request, res: Response) {
  const listas = await service.listarPorProceso(Number(req.params.procesoId), await filtroCarreraDe(req));
  res.json(listas);
}

/** Listas que compiten en una papeleta concreta. */
export async function listarPorVotacion(req: Request, res: Response) {
  const listas = await service.listarPorVotacion(Number(req.params.votacionId), await filtroCarreraDe(req));
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

export async function aprobar(req: Request, res: Response) {
  const lista = await service.aprobarLista(Number(req.params.id));
  if (!lista) {
    res.status(404).json({ error: 'Lista no encontrada.' });
    return;
  }
  res.json(lista);
}

export async function rechazar(req: Request, res: Response) {
  const { motivo } = rechazarListaSchema.parse(req.body);
  const lista = await service.rechazarLista(Number(req.params.id), motivo);
  if (!lista) {
    res.status(404).json({ error: 'Lista no encontrada.' });
    return;
  }
  res.json(lista);
}

export async function retirar(req: Request, res: Response) {
  const lista = await service.retirarLista(Number(req.params.id));
  if (!lista) {
    res.status(404).json({ error: 'Lista no encontrada.' });
    return;
  }
  res.json(lista);
}

/**
 * PATCH /api/listas-candidatas/:id/responsable — transfiere la responsabilidad
 * (y con ella la presidencia) a otro estudiante. Solo administración.
 */
export async function transferirResponsable(req: Request, res: Response) {
  const { cedula_nuevo_responsable } = transferirResponsableSchema.parse(req.body);
  const lista = await service.transferirResponsable(Number(req.params.id), cedula_nuevo_responsable);
  if (!lista) {
    res.status(404).json({ error: 'Lista no encontrada.' });
    return;
  }
  res.json(lista);
}
