import 'dotenv/config';
import express from 'express';
import { requestLogger } from './middleware/requestLogger';
import { rateLimiter }   from './middleware/rateLimiter';
import { errorHandler }  from './middleware/errorHandler';
import { registerRoutes } from './routes';

const app  = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(requestLogger);
app.use(rateLimiter);

registerRoutes(app);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// El errorHandler debe registrarse siempre al final
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Servidor CodeVote API corriendo en http://localhost:${PORT}`);
});
