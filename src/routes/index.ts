import { Express } from 'express';
import authRoutes                from './auth.routes.js';
import estudianteRoutes          from './estudiante.routes.js';
import facultadRoutes            from './facultad.routes.js';
import directorRoutes            from './director.routes.js';
import carreraRoutes             from './carrera.routes.js';
import responsableRoutes         from './responsable.routes.js';
import procesoElectoralRoutes    from './proceso_electoral.routes.js';
import cronogramaRoutes          from './cronograma.routes.js';
import votacionRoutes            from './votacion.routes.js';
import listaCandidataRoutes      from './lista_candidata.routes.js';
import candidatoRoutes           from './candidato.routes.js';
import requisitoRoutes           from './requisito.routes.js';
import validacionRequisitoRoutes from './validacion_requisito.routes.js';
import planTrabajoRoutes         from './plan_trabajo.routes.js';
import votoRoutes                from './voto.routes.js';
import codigoVotoRoutes          from './codigo_voto.routes.js';
import actaResultadosRoutes      from './acta_resultados.routes.js';
import veedorRoutes              from './veedor.routes.js';
import veeduriaRoutes            from './veeduria.routes.js';

export function registerRoutes(app: Express) {
  // Autenticación
  app.use('/api/auth',                   authRoutes);

  // Catálogos institucionales
  app.use('/api/facultades',             facultadRoutes);
  app.use('/api/directores',             directorRoutes);
  app.use('/api/carreras',               carreraRoutes);
  app.use('/api/responsables',           responsableRoutes);
  app.use('/api/estudiantes',            estudianteRoutes);

  // Proceso electoral
  app.use('/api/procesos-electorales',   procesoElectoralRoutes);
  app.use('/api/cronogramas',            cronogramaRoutes);
  app.use('/api/votaciones',             votacionRoutes);

  // Candidaturas
  app.use('/api/listas-candidatas',      listaCandidataRoutes);
  app.use('/api/candidatos',             candidatoRoutes);
  app.use('/api/planes-trabajo',         planTrabajoRoutes);
  app.use('/api/requisitos',             requisitoRoutes);
  app.use('/api/validaciones-requisito', validacionRequisitoRoutes);

  // Votación y resultados
  app.use('/api/votos',                  votoRoutes);
  app.use('/api/codigos-voto',           codigoVotoRoutes);
  app.use('/api/actas-resultados',       actaResultadosRoutes);

  // Veeduría
  app.use('/api/veedores',               veedorRoutes);
  app.use('/api/veedurias',              veeduriaRoutes);
}
