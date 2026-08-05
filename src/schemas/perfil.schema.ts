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

// Cambio de contraseña propio: exige la contraseña actual y una nueva válida.
export const cambiarPasswordSchema = z.object({
  password_actual: z.string().min(1, 'Debes indicar tu contraseña actual.'),
  password_nueva:  z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres.'),
});

export type ActualizarFotoDTO   = z.infer<typeof actualizarFotoSchema>;
export type CambiarPasswordDTO  = z.infer<typeof cambiarPasswordSchema>;
