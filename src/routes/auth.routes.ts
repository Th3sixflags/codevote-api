import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt    from 'jsonwebtoken';
import { pool } from '../config/database';

const router = Router();

router.post('/login', async (req, res) => {
  const { correo_institucional, password } = req.body as { correo_institucional?: string; password?: string };
  if (!correo_institucional || !password) {
    res.status(400).json({ error: 'Correo institucional y password son requeridos.' });
    return;
  }

  const [rows] = await pool.query(
    'SELECT cedula, nombres, apellidos, correo_institucional, password FROM estudiante WHERE correo_institucional = ?',
    [correo_institucional]
  ) as [any[], any];

  const usuario = rows[0];
  if (!usuario || !(await bcrypt.compare(password, usuario.password))) {
    res.status(401).json({ error: 'Credenciales inválidas.' });
    return;
  }

  // Si es un admin determinado, le damos rol admin.
  const is_admin = correo_institucional === 'schininin@uide.edu.ec';

  const token = jwt.sign(
    { sub: usuario.cedula, email: usuario.correo_institucional, rol: is_admin ? 'admin' : 'estudiante' },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '1h') as any }
  );

  res.json({
    token,
    usuario: { cedula: usuario.cedula, nombres: usuario.nombres, apellidos: usuario.apellidos, rol: is_admin ? 'admin' : 'estudiante' },
  });
});

export default router;
