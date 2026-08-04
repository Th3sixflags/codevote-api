import { Request, Response } from 'express';
import * as recordatorioRepo from '../repositories/recordatorio.repository.js';
import * as avisos from '../services/avisos_electorales.service.js';
import { crearRecordatorioSchema, resolverSancionSchema } from '../schemas/recordatorio.schema.js';
import { HttpError } from '../utils/httpError.js';

const numero = (valor: unknown) => {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

// --- Recordatorios programados (solo administración) ------------------------

/** GET /api/recordatorios?proceso=1 */
export async function listar(req: Request, res: Response) {
  res.json(await recordatorioRepo.findAll(numero(req.query.proceso)));
}

/** POST /api/recordatorios */
export async function crear(req: Request, res: Response) {
  const data = crearRecordatorioSchema.parse(req.body);
  const creado = await recordatorioRepo.create({ ...data, creador: req.user!.sub });
  res.status(201).json(creado);
}

/**
 * DELETE /api/recordatorios/:id — solo mientras no haya salido.
 * Un recordatorio ya enviado se conserva como registro de lo que se comunicó.
 */
export async function eliminar(req: Request, res: Response) {
  const existente = await recordatorioRepo.findById(Number(req.params.id));
  if (!existente) {
    res.status(404).json({ error: 'Recordatorio no encontrado.' });
    return;
  }
  if (!(await recordatorioRepo.remove(Number(req.params.id)))) {
    throw new HttpError(409, 'Ese recordatorio ya se envió: no se puede cancelar, queda como registro de lo comunicado.');
  }
  res.status(204).send();
}

// --- Sanciones ---------------------------------------------------------------

/** GET /api/sanciones?votacion=1&proceso=2 (solo administración) */
export async function listarSanciones(req: Request, res: Response) {
  res.json(await avisos.listarSanciones({
    votacionId: numero(req.query.votacion),
    procesoId:  numero(req.query.proceso),
  }));
}

/** GET /api/sanciones/mias — las faltas de quien consulta. */
export async function misSanciones(req: Request, res: Response) {
  res.json(await avisos.sancionesDeEstudiante(req.user!.sub));
}

/**
 * PATCH /api/sanciones/:id — justificar o anular (solo administración).
 * Nunca se borra: la falta y su resolución son historial electoral.
 */
export async function resolverSancion(req: Request, res: Response) {
  const { estado, observacion } = resolverSancionSchema.parse(req.body);
  const sancion = await avisos.resolverSancion(Number(req.params.id), estado, observacion ?? null);
  if (!sancion) {
    res.status(404).json({ error: 'Sanción no encontrada.' });
    return;
  }
  res.json(sancion);
}
