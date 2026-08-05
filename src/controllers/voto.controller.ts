import { Request, Response } from 'express';
import { crearVotoSchema } from '../schemas/voto.schema.js';
import * as service from '../services/voto.service.js';
import { filtroCarreraDe } from '../utils/accesoCarrera.js';

export async function votar(req: Request, res: Response) {
  const data = crearVotoSchema.parse(req.body);
  const cedula = req.user!.sub;

  // Un estudiante solo puede votar una vez por votación.
  if (await service.yaVoto(data.fk_id_votacion, cedula)) {
    res.status(409).json({ error: 'Ya has emitido tu voto en esta votación.' });
    return;
  }

  try {
    // El filtro de carrera se resuelve aquí y se valida en el servicio.
    const voto = await service.registrarVoto(data, cedula, await filtroCarreraDe(req));
    res.status(201).json(voto);
  } catch (err: any) {
    // Carrera: dos peticiones simultáneas. La restricción única de codigo_voto
    // rechaza la segunda; se responde con el mismo 409 que la comprobación previa.
    if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
      res.status(409).json({ error: 'Ya has emitido tu voto en esta votación.' });
      return;
    }
    throw err;
  }
}

/**
 * Resultados de una papeleta: conteo por opción y resumen de participación,
 * ganador y empate. Es de solo lectura: aunque el padrón haya votado completo,
 * no cierra la votación — eso lo decide el admin.
 *
 * El escrutinio es EXCLUSIVAMENTE administrativo. La ruta ya exige `requireAdmin`
 * (401 sin token, 403 para estudiante o candidato), así que aquí no hay ninguna
 * excepción por estado: cerrar la votación o finalizar el proceso no habilita a
 * nadie más a consultarlo. El cálculo en vivo y el cierre automático no cambian:
 * solo cambia quién puede pedirlo.
 */
export async function resultados(req: Request, res: Response) {
  const resultados = await service.obtenerResultados(Number(req.params.votacionId));
  res.json(resultados);
}

export async function resultadosEstudiante(req: Request, res: Response) {
  const resultados = await service.obtenerResultadosEstudiante(
    Number(req.params.votacionId),
    await filtroCarreraDe(req),
  );
  res.json(resultados);
}
