import { Request, Response } from 'express';
import { crearVeeduriaSchema, actualizarVeeduriaSchema } from '../schemas/veeduria.schema.js';
import * as service from '../services/veeduria.service.js';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarVeeduria();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerVeeduria(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Veeduría no encontrada.' });
    return;
  }
  res.json(registro);
}

export async function listarPorVotacion(req: Request, res: Response) {
  const registros = await service.listarPorVotacion(Number(req.params.votacionId));
  res.json(registros);
}

export async function crear(req: Request, res: Response) {
  const data  = crearVeeduriaSchema.parse(req.body);
  const nuevo = await service.crearVeeduria(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarVeeduriaSchema.parse(req.body);
  const actualizado = await service.actualizarVeeduria(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Veeduría no encontrada.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarVeeduria(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Veeduría no encontrada.' });
    return;
  }
  res.status(204).send();
}
