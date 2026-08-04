import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import * as service from '../services/auth.service.js';
import { solicitarCodigoSchema, verificarCodigoSchema } from '../schemas/auth.schema.js';

/** IP real del cliente (Express ya resuelve X-Forwarded-For con trust proxy). */
const ipDe = (req: Request) => (req.ip ?? null);

/**
 * POST /api/auth/codigo — envía el código de acceso al correo institucional.
 *
 * Responde siempre 200 con la misma forma, exista o no la cuenta: si no existe,
 * `correo_enmascarado` va en null y no se envía nada. Así el login no sirve para
 * averiguar qué correos o cédulas están registrados.
 */
export async function solicitarCodigo(req: Request, res: Response) {
  const { identificador } = solicitarCodigoSchema.parse(req.body);
  const resultado = await service.solicitarCodigo(identificador, ipDe(req));

  res.json({
    ...resultado,
    mensaje: 'Si el correo o la cédula corresponden a una cuenta activa, te enviamos un código.',
    espera_reenvio_segundos: service.ESPERA_REENVIO_SEG,
  });
}

/** POST /api/auth/verificar — canjea el código por la sesión (JWT). */
export async function verificarCodigo(req: Request, res: Response) {
  const { identificador, codigo } = verificarCodigoSchema.parse(req.body);
  res.json(await service.verificarCodigo(identificador, codigo));
}

/**
 * POST /api/auth/login — inicio de sesión por contraseña.
 *
 * DESACTIVADO por defecto: el acceso es por código al correo. Se conserva como
 * puerta de emergencia por si el SMTP se cae y la administración necesita
 * entrar; se habilita con AUTH_PASSWORD_FALLBACK=true. Con la variable sin
 * definir responde 410 y explica cuál es el flujo vigente.
 */
export async function loginConPassword(req: Request, res: Response) {
  if (process.env.AUTH_PASSWORD_FALLBACK !== 'true') {
    res.status(410).json({
      error: 'El acceso con contraseña ya no está disponible. Pide tu código en /api/auth/codigo y canjéalo en /api/auth/verificar.',
    });
    return;
  }

  const { correo_institucional, password } = req.body as { correo_institucional?: string; password?: string };
  if (!correo_institucional || !password) {
    res.status(400).json({ error: 'Correo institucional y password son requeridos.' });
    return;
  }

  const [rows] = await pool.query(
    `SELECT cedula, nombres, apellidos, correo_institucional, password, rol, foto_url
       FROM estudiante
      WHERE correo_institucional = ? AND estado_academico = 'activo'`,
    [correo_institucional]
  ) as [any[], any];

  const usuario = rows[0];
  // Una cuenta sin contraseña (las creadas ya con OTP) nunca puede entrar por aquí.
  if (!usuario?.password || !(await bcrypt.compare(password, usuario.password))) {
    res.status(401).json({ error: 'Credenciales inválidas.' });
    return;
  }

  const token = jwt.sign(
    { sub: usuario.cedula, email: usuario.correo_institucional, rol: usuario.rol },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as any }
  );

  res.json({
    token,
    usuario: {
      cedula:               usuario.cedula,
      nombres:              usuario.nombres,
      apellidos:            usuario.apellidos,
      correo_institucional: usuario.correo_institucional,
      rol:                  usuario.rol,
      foto_url:             usuario.foto_url ?? null,
    },
  });
}
