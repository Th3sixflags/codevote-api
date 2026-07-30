import { Request, Response } from 'express';
import { crearProcesoSchema, actualizarProcesoSchema } from '../schemas/proceso_electoral.schema.js';
import * as service from '../services/proceso_electoral.service.js';
import { filtroCarreraDe } from '../utils/accesoCarrera.js';

export async function listar(req: Request, res: Response) {
  // Filtro opcional: ?estado=actuales | finalizados | archivados.
  // Además se filtra por carrera: el estudiante solo ve los procesos globales y
  // los de su propia carrera; la administración ve todos.
  const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined;
  const procesos = await service.listarProcesos(estado, await filtroCarreraDe(req));
  res.json(procesos);
}

export async function obtener(req: Request, res: Response) {
  // Un proceso de otra carrera se responde como no encontrado, para no revelar
  // su existencia a quien no puede participar en él.
  const proceso = await service.obtenerProceso(Number(req.params.id), await filtroCarreraDe(req));
  if (!proceso) {
    res.status(404).json({ error: 'Proceso electoral no encontrado.' });
    return;
  }
  res.json(proceso);
}

export async function crear(req: Request, res: Response) {
  const data  = crearProcesoSchema.parse(req.body);
  const nuevo = await service.crearProceso(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarProcesoSchema.parse(req.body);
  const actualizado = await service.actualizarProceso(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Proceso electoral no encontrado.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarProceso(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Proceso electoral no encontrado.' });
    return;
  }
  res.status(204).send();
}

export async function cancelar(req: Request, res: Response) {
  const cancelado = await service.cancelarProceso(Number(req.params.id));
  if (!cancelado) {
    res.status(404).json({ error: 'Proceso electoral no encontrado.' });
    return;
  }
  res.json(cancelado);
}

export async function archivar(req: Request, res: Response) {
  const archivado = await service.archivarProceso(Number(req.params.id));
  if (!archivado) {
    res.status(404).json({ error: 'Proceso electoral no encontrado.' });
    return;
  }
  res.json(archivado);
}
