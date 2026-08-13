import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extraerTokenSesion } from '../src/session-token.js';

describe('extraccion de la sesion para el MCP', () => {
  it('acepta el contrato JSON usado fuera de produccion', () => {
    const cabeceras = new Headers();
    assert.equal(extraerTokenSesion({ token: 'jwt-desarrollo' }, cabeceras), 'jwt-desarrollo');
  });

  it('lee la cookie HttpOnly usada en produccion', () => {
    const cabeceras = new Headers();
    cabeceras.append(
      'set-cookie',
      'codevote_access=jwt-produccion; Max-Age=900; Path=/api; Expires=Thu, 13 Aug 2026 20:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
    );
    cabeceras.append(
      'set-cookie',
      'codevote_refresh=refresh-opaco; Max-Age=604800; Path=/api/auth/refresh; HttpOnly; Secure; SameSite=Lax',
    );

    assert.equal(extraerTokenSesion({ usuario: { rol: 'admin' } }, cabeceras), 'jwt-produccion');
  });

  it('devuelve null cuando la respuesta no contiene una sesion', () => {
    assert.equal(extraerTokenSesion({ usuario: {} }, new Headers()), null);
  });
});
