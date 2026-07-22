import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { requestLogger } from './middleware/requestLogger';
import { rateLimiter }   from './middleware/rateLimiter';
import { errorHandler }  from './middleware/errorHandler';
import { registerRoutes } from './routes';

const app  = express();
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

// Orígenes permitidos para el frontend (separados por coma en CORS_ORIGIN).
// Si CORS_ORIGIN no está definido, se permite cualquier origen (solo para pruebas).
const origenes = process.env.CORS_ORIGIN
  ?.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: origenes && origenes.length > 0 ? origenes : true,
  credentials: true,
}));

app.use(express.json());
app.use(requestLogger);
app.use(rateLimiter);

registerRoutes(app);

// Estado del servicio. Se expone en ambas rutas:
// /health      -> para comprobaciones internas (pipeline, dentro del servidor)
// /api/health  -> accesible desde fuera, ya que Nginx enruta /api/ al backend
const estadoServicio = (_req: express.Request, res: express.Response) =>
  res.json({
    status: 'ok',
    servicio: 'codevote-api',
    fecha: new Date().toISOString(),
  });

app.get('/health', estadoServicio);
app.get('/api/health', estadoServicio);

// El errorHandler debe registrarse siempre al final
app.use(errorHandler);

app.listen(PORT, HOST, () => {
  console.log(`Servidor CodeVote API corriendo en http://${HOST}:${PORT}`);
  console.log(`CORS permitido para: ${origenes?.length ? origenes.join(', ') : 'cualquier origen (modo pruebas)'}`);
});
