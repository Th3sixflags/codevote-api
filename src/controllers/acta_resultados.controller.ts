import { Request, Response } from 'express';
import { crearActaResultadosSchema, actualizarActaResultadosSchema } from '../schemas/acta_resultados.schema.js';
import * as service from '../services/acta_resultados.service.js';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarActaResultados();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerActaResultados(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Acta no encontrada.' });
    return;
  }
  res.json(registro);
}

export async function listarPorVotacion(req: Request, res: Response) {
  const registros = await service.listarPorVotacion(Number(req.params.votacionId));
  res.json(registros);
}

export async function crear(req: Request, res: Response) {
  const data  = crearActaResultadosSchema.parse(req.body);
  const nuevo = await service.crearActaResultados(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarActaResultadosSchema.parse(req.body);
  const actualizado = await service.actualizarActaResultados(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Acta no encontrada.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarActaResultados(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Acta no encontrada.' });
    return;
  }
  res.status(204).send();
}
