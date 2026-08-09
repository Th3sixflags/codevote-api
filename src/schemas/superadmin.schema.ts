import { z } from 'zod';

export const loginSchema = z.object({
  correo: z.string().email('Debe ser un correo válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export type LoginDTO = z.infer<typeof loginSchema>;
