import { Request, Response } from 'express';
import { asignarCandidaturaSchema } from '../schemas/asignacion_candidatura.schema.js';
import * as service from '../services/asignacion_candidatura.service.js';
import { institucionDeSesion } from '../utils/institucion.js';

// --- Administración: /estudiantes/:cedula/asignacion-candidatura -------------

export async function obtener(req: Request, res: Response) {
  const asignacion = await service.obtenerDeEstudiante(req.params.cedula as string, institucionDeSesion(req.user?.rol, req.user?.fk_id_institucion));
  if (!asignacion) {
    res.status(404).json({ error: 'Este estudiante no tiene una asignación de candidatura.' });
    return;
  }
  res.json(asignacion);
}

export async function asignar(req: Request, res: Response) {
  const { fk_id_votacion } = asignarCandidaturaSchema.parse(req.body);
  const asignacion = await service.asignar(req.params.cedula as string, fk_id_votacion, institucionDeSesion(req.user?.rol, req.user?.fk_id_institucion));
  res.status(201).json(asignacion);
}

export async function reasignar(req: Request, res: Response) {
  const { fk_id_votacion } = asignarCandidaturaSchema.parse(req.body);
  const asignacion = await service.reasignar(req.params.cedula as string, fk_id_votacion, institucionDeSesion(req.user?.rol, req.user?.fk_id_institucion));
  if (!asignacion) {
    res.status(404).json({ error: 'Este estudiante no tiene una asignación de candidatura.' });
    return;
  }
  res.json(asignacion);
}

export async function retirar(req: Request, res: Response) {
  const retirada = await service.retirar(req.params.cedula as string, institucionDeSesion(req.user?.rol, req.user?.fk_id_institucion));
  if (!retirada) {
    res.status(404).json({ error: 'Este estudiante no tiene una asignación de candidatura.' });
    return;
  }
  res.status(204).send();
}

// --- Candidato: /candidato/mi-asignacion -------------------------------------

/**
 * Papeleta asignada al candidato autenticado. Devuelve null si aún no tiene
 * ninguna: en ese caso el portal debe indicar que espere la asignación del
 * administrador (sin ella no puede crear su lista).
 */
export async function miAsignacion(req: Request, res: Response) {
  const asignacion = await service.obtenerActiva(req.user!.sub, institucionDeSesion(req.user?.rol, req.user?.fk_id_institucion));
  res.json(asignacion);
}
