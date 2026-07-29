import { z } from 'zod';

// Foto de perfil: una URL http(s) válida, o cadena vacía para quitarla.
export const actualizarFotoSchema = z.object({
  foto_url: z.union([z.string().url().max(255), z.literal('')]),
});

// Cambio de contraseña propio: exige la contraseña actual y una nueva válida.
export const cambiarPasswordSchema = z.object({
  password_actual: z.string().min(1, 'Debes indicar tu contraseña actual.'),
  password_nueva:  z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres.'),
});

export type ActualizarFotoDTO   = z.infer<typeof actualizarFotoSchema>;
export type CambiarPasswordDTO  = z.infer<typeof cambiarPasswordSchema>;
