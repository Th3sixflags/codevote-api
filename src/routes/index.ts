import { Express } from 'express';
import authRoutes                from './auth.routes';
import estudianteRoutes          from './estudiante.routes';
import facultadRoutes            from './facultad.routes';
import directorRoutes            from './director.routes';
import carreraRoutes             from './carrera.routes';
import responsableRoutes         from './responsable.routes';
import procesoElectoralRoutes    from './proceso_electoral.routes';
import cronogramaRoutes          from './cronograma.routes';
import votacionRoutes            from './votacion.routes';
import listaCandidataRoutes      from './lista_candidata.routes';
import candidatoRoutes           from './candidato.routes';
import requisitoRoutes           from './requisito.routes';
import validacionRequisitoRoutes from './validacion_requisito.routes';
import planTrabajoRoutes         from './plan_trabajo.routes';
import votoRoutes                from './voto.routes';
import codigoVotoRoutes          from './codigo_voto.routes';
import actaResultadosRoutes      from './acta_resultados.routes';
import veedorRoutes              from './veedor.routes';
import veeduriaRoutes            from './veeduria.routes';

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
