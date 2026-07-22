import { Request, Response } from 'express';
import { crearPlanTrabajoSchema, actualizarPlanTrabajoSchema } from '../schemas/plan_trabajo.schema';
import * as service from '../services/plan_trabajo.service';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarPlanTrabajo();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerPlanTrabajo(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Plan de trabajo no encontrado.' });
    return;
  }
  res.json(registro);
}

export async function listarPorLista(req: Request, res: Response) {
  const registros = await service.listarPorLista(Number(req.params.listaId));
  res.json(registros);
}

export async function crear(req: Request, res: Response) {
  const data  = crearPlanTrabajoSchema.parse(req.body);
  const nuevo = await service.crearPlanTrabajo(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarPlanTrabajoSchema.parse(req.body);
  const actualizado = await service.actualizarPlanTrabajo(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Plan de trabajo no encontrado.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarPlanTrabajo(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Plan de trabajo no encontrado.' });
    return;
  }
  res.status(204).send();
}
