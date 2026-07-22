import { Request, Response } from 'express';
import { crearVeedorSchema, actualizarVeedorSchema } from '../schemas/veedor.schema';
import * as service from '../services/veedor.service';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarVeedor();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerVeedor(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Veedor no encontrado.' });
    return;
  }
  res.json(registro);
}

export async function crear(req: Request, res: Response) {
  const data  = crearVeedorSchema.parse(req.body);
  const nuevo = await service.crearVeedor(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarVeedorSchema.parse(req.body);
  const actualizado = await service.actualizarVeedor(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Veedor no encontrado.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarVeedor(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Veedor no encontrado.' });
    return;
  }
  res.status(204).send();
}
