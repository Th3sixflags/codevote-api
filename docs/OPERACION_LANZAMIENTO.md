# Operación y lanzamiento

Este runbook no ejecuta acciones en AWS: el operador las realiza con una ventana
de mantenimiento, credenciales de menor privilegio y un segundo revisor.

## Migraciones verificables

1. Cree un backup consistente antes de cualquier DDL.
2. Aplique el SQL requerido con el cliente MySQL.
3. Registre **ese mismo archivo** en el ledger, indicando el operador.
4. Revise que ningún checksum difiera antes de desplegar.

```bash
# En el checkout que contiene exactamente el commit a desplegar.
npm run build
mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  < db/migrations/2026-08-13_control_migraciones.sql

MIGRATIONS_OPERATOR="nombre.apellido" \
  npm run migraciones:registrar -- 2026-08-13_control_migraciones.sql
npm run migraciones:estado
```

`PENDIENTE` significa que el SQL aún no está registrado; `CHECKSUM_DISTINTO` o
`NO_EN_REPOSITORIO` bloquean el despliegue hasta investigar. El comando de
registro no ejecuta DDL: solo deja evidencia del archivo que el operador ya
aplicó. Nunca se debe registrar una migración sin haberla aplicado y validado.

La imagen de backend incluye `db/migrations` únicamente para calcular
checksums. Tras el despliegue, CI registra
`2026-08-13_control_migraciones.sql` dentro del contenedor; si se necesita una
recuperación manual, usar:

```bash
sudo docker compose exec -T -e MIGRATIONS_OPERATOR="nombre.apellido" backend \
  npm run migraciones:registrar -- 2026-08-13_control_migraciones.sql
```

## Backup y simulacro de recuperación

En AWS, guardar el dump cifrado fuera de la instancia y comprobar su hash:

```bash
sudo docker exec codevote-mysql mysqldump -u root -p \
  --single-transaction --routines --events --triggers --databases codevote_db \
  > codevote_$(date +%F_%H%M).sql
sha256sum codevote_*.sql
```

El simulacro se hace en una base/host de recuperación aislado, nunca en
producción:

```bash
mysql -u "$DB_USER" -p -e 'CREATE DATABASE codevote_restore_test CHARACTER SET utf8mb4'
mysql -u "$DB_USER" -p codevote_restore_test < codevote_YYYY-MM-DD_HHMM.sql
mysql -u "$DB_USER" -p -e 'SHOW TABLES FROM codevote_restore_test'
```

Validar conteos de tablas críticas, `schema_migrations`, hashes de actas y una
consulta pública de comprobante con datos de prueba. Registrar duración, RPO y
RTO observados; destruir únicamente la base de restauración tras la aprobación.

## Monitoreo y alertas

- Liveness: `GET /api/health` debe responder 200.
- Readiness: `GET /api/health/ready` debe responder 200; 503 indica MySQL o
  ledger no disponible.
- Alertar ante 5xx, latencia alta, reinicios del contenedor, espacio libre menor
  a 20%, errores de MySQL y fallos de backup.
- Conservar logs sin cuerpos de voto, códigos OTP, refresh tokens o cookies.

```bash
curl --fail --silent https://<dominio>/api/health
curl --fail --silent https://<dominio>/api/health/ready
df -h
sudo docker stats --no-stream
```

## Checklist de demo institucional

1. Confirmar `/api/health` y `/api/health/ready`.
2. Probar OTP con cuentas demo, sin compartir códigos en pantalla.
3. Crear una papeleta de demostración y emitir un voto blanco.
4. Abrir “Mis recibos” y verificar el código público; no mostrar identidad ni
   opción votada.
5. Mostrar resultados/acta solo después del cierre de la papeleta demo.
6. Cerrar la sesión y revocar cualquier sesión de demostración.

## Accesibilidad y responsive

Revisión manual WCAG 2.2 AA antes del evento: navegación completa por teclado,
foco visible, zoom al 200%, lector de pantalla en emisión de voto, contraste de
texto y estados, y anchos de 320px, 768px y 1440px. La emisión debe conservar
etiquetas accesibles en opciones, confirmación y errores; no usar solo color
para comunicar estado. Documentar incidencias y no compensarlas con cambios de
lógica electoral durante la ventana de lanzamiento.
