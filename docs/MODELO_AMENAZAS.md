# Modelo de amenazas — sesiones y secreto del voto

## Activos que se protegen

- Credenciales OTP, JWT de acceso y refresh tokens.
- Padrón e identidad del elector.
- Sentido del voto, que solo existe en `voto` sin cédula.
- Comprobantes de participación, actas y auditoría.

## Límites de confianza

El navegador, API, MySQL, SMTP y el proxy TLS son límites distintos. El
frontend es un cliente no confiable: sus roles y rutas solo mejoran UX; cada
permiso se vuelve a comprobar en API. MySQL y las claves de JWT deben quedar
accesibles únicamente a los servicios autorizados.

## Amenazas y controles

| Amenaza | Control |
|---|---|
| XSS roba un JWT | El JWT y refresh viven en cookies `HttpOnly`; no se guardan ni se leen desde `localStorage`. |
| CSRF contra operaciones autenticadas | `SameSite=Lax`, CORS con origen explícito y verificación de `Origin` para mutaciones con cookie. |
| Reutilización de refresh | Refresh opaco de 256 bits, almacenado como SHA-256, consumido una vez; su uso revoca la sesión anterior y emite otra. |
| Token robado o equipo perdido | Sesiones con `jti`, expiración, logout y logout global; cada request comprueba sesión activa. |
| Enumeración de cuentas/OTP | Respuesta uniforme, OTP hasheado, expiración, un uso, intentos y rate limits. |
| Correlación elector → voto | `voto` no tiene cédula ni FK a `codigo_voto`; el comprobante solo prueba participación. No se deben combinar logs de aplicación, IP, timestamps finos y consultas de MySQL para crear correlaciones. |
| Correlación por timestamp | Respuestas públicas solo muestran fecha de comprobante; auditoría no guarda body, token ni opción. Los resultados son agregados. Para elecciones de alta sensibilidad, limitar granularidad de tiempos y separar físicamente los datos de participación y votos. |
| Manipulación del escrutinio | Cierre transaccional, actas SHA-256 e inmutabilidad de actas/auditoría por triggers. |

## Restricción importante de anonimato

La separación actual evita una relación de base de datos entre identidad y voto,
pero no convierte una infraestructura comprometida en anonimato criptográfico:
un operador con acceso simultáneo a logs, red y base podría inferir correlaciones
temporales. Antes de una elección con adversario fuerte se requiere una fase
adicional (canal de anonimización, mezcla/batching y revisión externa).

## Operación segura

- Producción debe usar HTTPS, `NODE_ENV=production`, `CORS_ORIGIN` exacto y
  `COOKIE_SECURE=true`.
- No registrar `Cookie`, `Authorization`, OTP, refresh token ni bodies de voto.
- Aplicar la migración de refresh antes de desplegar el código.
- Los clientes API no navegador deben migrar a un mecanismo dedicado; `Bearer`
  existe solo como compatibilidad controlada y no lo usa el frontend web.
