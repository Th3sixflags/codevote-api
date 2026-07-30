import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import multer from 'multer';

/**
 * Almacenamiento de archivos subidos (planes de trabajo en PDF).
 *
 * IMPORTANTE (despliegue): UPLOADS_DIR debe apuntar a un VOLUMEN PERSISTENTE
 * montado en el contenedor. Si se deja dentro del contenedor sin volumen, los
 * archivos se pierden en cada redespliegue (que ocurre en cada push).
 *
 * Los archivos se sirven en /api/uploads/... (no en /uploads/...) porque Nginx
 * enruta /api/ hacia el backend y el resto hacia el frontend: así funcionan sin
 * cambiar la configuración del servidor.
 */
export const DIRECTORIO_UPLOADS = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), 'uploads');

export const SUBRUTA_PLANES = 'planes';
export const RUTA_PUBLICA   = '/api/uploads';

/** Tamaño máximo de un plan de trabajo en PDF. */
export const MAX_BYTES_PDF = 10 * 1024 * 1024; // 10 MB

const directorioPlanes = path.join(DIRECTORIO_UPLOADS, SUBRUTA_PLANES);

/** Crea el directorio de subidas si no existe (al arrancar). */
export function prepararDirectorios() {
  if (!existsSync(directorioPlanes)) {
    mkdirSync(directorioPlanes, { recursive: true });
  }
}

const almacenamiento = multer.diskStorage({
  destination: (_req, _file, cb) => {
    prepararDirectorios();
    cb(null, directorioPlanes);
  },
  // Nombre aleatorio: evita colisiones y que el nombre original del archivo
  // (que viene del cliente) pueda usarse para escribir fuera del directorio.
  filename: (_req, _file, cb) => cb(null, `${randomUUID()}.pdf`),
});

/** Middleware de subida: un solo campo "archivo", solo PDF, máximo 10 MB. */
export const subirPlanPdf = multer({
  storage: almacenamiento,
  limits: { fileSize: MAX_BYTES_PDF, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('TIPO_NO_PDF'));
      return;
    }
    cb(null, true);
  },
}).single('archivo');

/** URL pública de un archivo de plan ya guardado. */
export function urlPublicaDePlan(nombreArchivo: string) {
  return `${RUTA_PUBLICA}/${SUBRUTA_PLANES}/${nombreArchivo}`;
}
