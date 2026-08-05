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

export const SUBRUTA_PLANES   = 'planes';
export const SUBRUTA_IMAGENES = 'imagenes';
export const RUTA_PUBLICA     = '/api/uploads';

/** Tamaño máximo de un plan de trabajo en PDF. */
export const MAX_BYTES_PDF = 10 * 1024 * 1024; // 10 MB

/**
 * Tamaño máximo de una imagen (foto de perfil, de una lista, de un proceso).
 * Más bajo que el del PDF a propósito: son fotos que se muestran en tarjetas y
 * avatares, y una foto de móvil sin recortar ronda los 3–4 MB.
 */
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024; // 5 MB

/**
 * Formatos de imagen admitidos, con la extensión con la que se guardan.
 *
 * Se acepta una lista cerrada y NO se confía en la extensión que envía el
 * cliente: el archivo se guarda con la que corresponde a su tipo declarado. Se
 * excluye SVG a propósito, porque un SVG puede llevar JavaScript dentro y se
 * serviría desde el mismo dominio que la aplicación.
 */
export const TIPOS_IMAGEN: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

const directorioPlanes   = path.join(DIRECTORIO_UPLOADS, SUBRUTA_PLANES);
const directorioImagenes = path.join(DIRECTORIO_UPLOADS, SUBRUTA_IMAGENES);

/** Crea los directorios de subidas si no existen (al arrancar). */
export function prepararDirectorios() {
  for (const directorio of [directorioPlanes, directorioImagenes]) {
    if (!existsSync(directorio)) mkdirSync(directorio, { recursive: true });
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

const almacenamientoImagenes = multer.diskStorage({
  destination: (_req, _file, cb) => {
    prepararDirectorios();
    cb(null, directorioImagenes);
  },
  // Nombre aleatorio y extensión derivada del TIPO, no del nombre que envía el
  // cliente: así "foto.php" o "../../x.jpg" no pueden decidir dónde ni con qué
  // nombre se escribe.
  filename: (_req, file, cb) => cb(null, `${randomUUID()}.${TIPOS_IMAGEN[file.mimetype] ?? 'jpg'}`),
});

/** Middleware de subida de imágenes: un solo campo "imagen", máximo 5 MB. */
export const subirImagen = multer({
  storage: almacenamientoImagenes,
  limits: { fileSize: MAX_BYTES_IMAGEN, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!TIPOS_IMAGEN[file.mimetype]) {
      cb(new Error('TIPO_NO_IMAGEN'));
      return;
    }
    cb(null, true);
  },
}).single('imagen');

/** URL pública de un archivo de plan ya guardado. */
export function urlPublicaDePlan(nombreArchivo: string) {
  return `${RUTA_PUBLICA}/${SUBRUTA_PLANES}/${nombreArchivo}`;
}

/** URL pública de una imagen ya guardada. */
export function urlPublicaDeImagen(nombreArchivo: string) {
  return `${RUTA_PUBLICA}/${SUBRUTA_IMAGENES}/${nombreArchivo}`;
}
