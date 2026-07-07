import { Express } from 'express';
import authRoutes              from './auth.routes';
import estudianteRoutes        from './estudiante.routes';
import procesoElectoralRoutes  from './proceso_electoral.routes';
import listaCandidataRoutes    from './lista_candidata.routes';
import votoRoutes              from './voto.routes';

export function registerRoutes(app: Express) {
  app.use('/api/auth',                authRoutes);
  app.use('/api/estudiantes',         estudianteRoutes);
  app.use('/api/procesos-electorales', procesoElectoralRoutes);
  app.use('/api/listas-candidatas',   listaCandidataRoutes);
  app.use('/api/votos',               votoRoutes);
}
