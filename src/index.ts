import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { requestLogger } from './middleware/requestLogger.js';
import { rateLimiter }   from './middleware/rateLimiter.js';
import { errorHandler }  from './middleware/errorHandler.js';
import { registerRoutes } from './routes/index.js';
import { openapiSpec } from './config/swagger.js';
import { iniciarCierreProgramado } from './tareas/cierreProgramado.js';
import { iniciarAvisosProgramados } from './tareas/avisosProgramados.js';
import { DIRECTORIO_UPLOADS, prepararDirectorios } from './config/uploads.js';
import { auditarMutacionesHttp } from './middleware/auditoria.js';

const app  = express();
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

// Detrás de Nginx: confiar en el proxy para que el rate-limit use la IP real
// del cliente (X-Forwarded-For) y no la del proxy.
app.set('trust proxy', 1);

// Cabeceras de seguridad HTTP (HSTS, X-Content-Type-Options, X-Frame-Options,
// Referrer-Policy, etc.). Se desactiva el CSP porque esta API solo sirve JSON
// (el CSP corresponde al frontend) y así no se rompe la carga de Swagger UI.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

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

// Documentación interactiva (Swagger UI). Pública y montada antes del
// rate limiter para que la carga de sus recursos no se vea limitada.
// Accesible en /api/docs (Nginx enruta /api/ hacia el backend).
// Se puede desactivar en producción con DOCS_ENABLED=false para no exponer
// públicamente la estructura completa de la API.
if (process.env.DOCS_ENABLED !== 'false') {
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, { customSiteTitle: 'CodeVote API — Documentación' }),
  );
  // El JSON crudo del OpenAPI, por si se necesita para generar clientes o el MCP.
  app.get('/api/openapi.json', (_req, res) => res.json(openapiSpec));
}

// Archivos subidos (planes de trabajo en PDF). Se sirven bajo /api/ porque
// Nginx enruta /api/ hacia el backend y el resto hacia el frontend: así no hace
// falta tocar la configuración del servidor. El directorio debe ser un volumen
// persistente (ver UPLOADS_DIR en .env.example).
prepararDirectorios();
app.use(
  '/api/uploads',
  express.static(DIRECTORIO_UPLOADS, {
    // Los PDF se descargan/abren, no se ejecutan.
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }),
);

app.use(express.json());
app.use(requestLogger);
app.use(auditarMutacionesHttp);
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

  // Cierra las papeletas cuyo proceso ya venció. Arranca con una
  // reconciliación —por si alguna venció con el servidor apagado— y sigue
  // comprobando cada minuto.
  iniciarCierreProgramado();

  // Recordatorios por correo del calendario electoral: apertura de la votación,
  // última llamada a quienes no han votado, faltas al cerrar y los envíos que la
  // administración haya programado.
  iniciarAvisosProgramados();
});
