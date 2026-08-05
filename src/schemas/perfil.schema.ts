import { z } from 'zod';
import { urlImagenHttpsSchema } from './common.js';

/**
 * Foto de perfil: una imagen subida a CodeVote o una URL https, igual que en el
 * resto del sistema. Antes admitía cualquier URL válida —incluida http://—, lo
 * que metía contenido mixto en una página servida por https.
 * Cadena vacía o null quitan la foto.
 */
export const actualizarFotoSchema = z.object({
  foto_url: urlImagenHttpsSchema,
});

export type ActualizarFotoDTO   = z.infer<typeof actualizarFotoSchema>;
