import * as repo from '../repositories/superadmin.repository.js';

export async function dashboard() {
  const [instituciones, procesosActivos, miembrosTotal, votosTotal] = await Promise.all([
    repo.countInstituciones(),
    repo.countProcesosActivos(),
    repo.countMiembrosTotal(),
    repo.countVotosTotal(),
  ]);

  return {
    instituciones,
    procesosActivos,
    miembrosTotal,
    votosTotal,
  };
}
