import jwt from 'jsonwebtoken';

const SECRET = 'c0d3v0t3_s3cur3_jwt_k3y_2026_uide_pr0j3ct!!';
const URL = 'https://codevote.lat/api';

const adminToken = jwt.sign(
  { sub: '1710000009', email: 'schininin@uide.edu.ec', rol: 'admin', fk_id_institucion: 1 },
  SECRET,
  { expiresIn: '1h' }
);

const studentToken = jwt.sign(
  { sub: '1710000017', email: 'mgonzalez@uide.edu.ec', rol: 'estudiante', fk_id_institucion: 1 },
  SECRET,
  { expiresIn: '1h' }
);

async function fetchApi(endpoint: string, token: string) {
  const res = await fetch(`${URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function run() {
  console.log('--- TEST COMO ADMIN ---');
  let res = await fetchApi('/estudiantes', adminToken);
  console.log('GET /estudiantes:', res.status, `(Total: ${res.data?.length})`);

  res = await fetchApi('/procesos-electorales', adminToken);
  console.log('GET /procesos-electorales:', res.status, `(Total: ${res.data?.length})`);
  
  res = await fetchApi('/instituciones', adminToken);
  console.log('GET /instituciones (como admin normal - debe fallar):', res.status);

  console.log('\n--- TEST COMO ESTUDIANTE ---');
  res = await fetchApi('/procesos-electorales', studentToken);
  console.log('GET /procesos-electorales (estudiante):', res.status, `(Total: ${res.data?.length})`);
  
  console.log('\n✅ PRUEBAS COMPLETADAS');
}

run();
