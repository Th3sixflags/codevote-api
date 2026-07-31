# CodeVote MCP

Servidor **MCP (Model Context Protocol)** de la API CodeVote. Permite que un
asistente de IA —Claude Desktop, Claude Code, o cualquier cliente MCP— consulte
el proceso electoral: procesos, papeletas, candidaturas, escrutinio, actas y
veeduría.

El análisis de transporte, capacidades y hardening que acompaña a este servidor
está en [`docs/TA-3.2-analisis.md`](docs/TA-3.2-analisis.md).

---

## Qué es y qué no es

MCP es un protocolo que estandariza cómo un modelo de lenguaje accede a
herramientas y datos externos. En lugar de escribir un plugin distinto para cada
asistente, se implementa un servidor MCP y lo entiende cualquier cliente
compatible.

Este servidor **no es una copia de la API**. La API tiene 71 rutas y 126 operaciones; el MCP expone
15 herramientas de consulta y 8 de administración, y ninguna de ellas puede votar
ni borrar. La diferencia es deliberada y está explicada en el análisis.

Arquitectura:

```
Claude  ──stdio/HTTP──▶  codevote-mcp  ──HTTPS + JWT──▶  codevote-api  ──▶  MySQL
                          │
                          └── política: lista negra, lista blanca, límites, redacción
```

El MCP habla con la **API REST**, no con MySQL. Así hereda el control de acceso
que ya vive en el backend (rol admin, segmentación por carrera, secreto del voto,
bloqueo de borrado con evidencia) en vez de reimplementarlo.

---

## Instalación

```bash
cd mcp && npm install && npm run build
```

Configura el entorno a partir de `.env.example`:

```bash
cp .env.example .env
```

Lo mínimo: `CODEVOTE_API_URL`, `CODEVOTE_EMAIL` y `CODEVOTE_PASSWORD`.

> Crea una **cuenta de servicio** para el MCP con el rol mínimo que necesites.
> Si le das una cuenta admin, el MCP podrá ver todo lo que ve un admin.

---

## Conectarlo a Claude

### Claude Desktop

Edita `~/Library/Application Support/Claude/claude_desktop_config.json`
(en Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "codevote": {
      "command": "node",
      "args": ["/ruta/absoluta/a/codevote-api/mcp/dist/index.js"],
      "env": {
        "CODEVOTE_API_URL": "https://codevote.lat/api",
        "CODEVOTE_EMAIL": "cuenta-mcp@uide.edu.ec",
        "CODEVOTE_PASSWORD": "...",
        "CODEVOTE_MCP_MODE": "lectura"
      }
    }
  }
}
```

Reinicia Claude Desktop. El servidor aparece en el icono de herramientas.

### Claude Code

Desde la raíz del repositorio:

```bash
claude mcp add codevote --env CODEVOTE_API_URL=https://codevote.lat/api --env CODEVOTE_EMAIL=cuenta-mcp@uide.edu.ec --env CODEVOTE_PASSWORD=... -- node ./mcp/dist/index.js
```

### MCP Inspector (para probar sin cliente)

```bash
npm run inspector
```

---

## Qué se puede hacer

Preguntas que el servidor resuelve de forma directa:

- «¿Cómo va la votación del consejo estudiantil?» → escrutinio con participación,
  ganador y si el dato es provisional u oficial.
- «¿Qué candidaturas faltan por revisar?» → listas en estado pendiente, con sus
  integrantes y el cumplimiento de requisitos de cada uno.
- «Hazme un informe del proceso 1» → datos, papeletas, cronograma, candidaturas y
  resultados de las papeletas cerradas.
- «¿Cuántos estudiantes hay habilitados por carrera?» → agregados del padrón, sin
  datos personales.
- «¿Qué observaciones registró la veeduría?» → veedores y veedurías por papeleta.

### Herramientas de consulta (siempre disponibles)

| Herramienta | Para qué |
|---|---|
| `codevote_estado_servidor` | Identidad, rol, modo, límites y salud de la API |
| `codevote_listar_procesos` | Procesos, con filtro actuales/finalizados/archivados |
| `codevote_detalle_proceso` | Proceso + papeletas + cronograma en una llamada |
| `codevote_cronograma` | Hitos y fechas de un proceso |
| `codevote_listar_papeletas` | Papeletas del sistema o de un proceso |
| `codevote_detalle_papeleta` | Papeleta + listas que compiten |
| `codevote_listar_listas` | Listas candidatas, filtrables por estado de revisión |
| `codevote_detalle_lista` | Lista + candidatos + planes de trabajo |
| `codevote_validaciones_candidato` | Requisitos cumplidos e incumplidos |
| `codevote_resultados` | Escrutinio agregado con participación y ganador |
| `codevote_actas` | Actas de resultados emitidas |
| `codevote_veeduria` | Veedores y veedurías |
| `codevote_catalogo` | Facultades, carreras, directores, responsables, requisitos |
| `codevote_padron_resumen` | Composición del padrón, **solo agregados** |
| `codevote_mis_notificaciones` | Notificaciones de la cuenta del MCP |

### Herramientas de administración (solo con `CODEVOTE_MCP_MODE=escritura`)

`codevote_crear_proceso`, `codevote_actualizar_proceso`, `codevote_cerrar_proceso`
(cancelar/archivar), `codevote_crear_papeleta`, `codevote_cambiar_estado_papeleta`,
`codevote_revisar_lista` (aprobar/rechazar), `codevote_crear_hito_cronograma`,
`codevote_registrar_acta`.

### Recursos

- `codevote://guia/modelo-electoral` — vocabulario y reglas del dominio.
- `codevote://politica-de-seguridad` — política activa: modo, límites y listas.
- `codevote://api/contrato` — rutas reales de la API frente a las que expone el MCP.

### Prompts

- `auditar-papeleta` — revisión completa de una votación.
- `informe-de-proceso` — informe ejecutivo de un proceso.
- `revisar-candidaturas` — repaso de las listas pendientes con recomendación.

---

## Qué NO se puede hacer

Tres cosas están bloqueadas en `src/politica.ts` y **no se habilitan con ninguna
variable de entorno**, ni siquiera con una cuenta admin:

1. **Emitir un voto.** Votar es un acto personalísimo del estudiante.
2. **Borrar cualquier registro.** La evidencia electoral se cancela o se archiva.
3. **Tocar credenciales** (`/auth/*`, `/perfil/*`).

Además, ninguna ruta devuelve qué votó una persona: la API guarda el voto y el
comprobante por separado y nunca expone el hash que los relaciona.

---

## Modos y límites

| Variable | Por defecto | Qué hace |
|---|---|---|
| `CODEVOTE_MCP_MODE` | `lectura` | En `lectura`, las herramientas de escritura no se registran |
| `CODEVOTE_MCP_REDACT_PII` | `true` | Enmascara cédulas (`******0009`) y correos (`s********@uide.edu.ec`) |
| `CODEVOTE_MCP_TIMEOUT_MS` | `8000` | Corta la petición a la API |
| `CODEVOTE_MCP_MAX_BYTES` | `262144` | Tope de respuesta; evita inundar el contexto |
| `CODEVOTE_MCP_MAX_ITEMS` | `50` | Elementos por herramienta, con aviso de truncado |
| `CODEVOTE_MCP_RATE_MAX` | `60` | Peticiones por ventana, aplicadas antes de salir a la red |

---

## Transporte HTTP

Por defecto el servidor usa **stdio**: proceso hijo del cliente, sin puertos
abiertos. Para desplegarlo aparte:

```bash
CODEVOTE_MCP_TRANSPORT=http \
CODEVOTE_MCP_HTTP_TOKEN=$(node -e "console.log(crypto.randomUUID()+crypto.randomUUID())") \
npm start
```

Escucha en `http://127.0.0.1:3333/mcp` con token Bearer obligatorio, validación de
`Host` y `Origin` (anti DNS rebinding), sesiones con UUID y tope de cuerpo de 1 MiB.
Publícalo siempre detrás de un proxy con TLS, nunca directamente.

---

## Pruebas

Con la API corriendo en `localhost:3000` y la base de ejemplo cargada:

```bash
npm test
```

22 pruebas: política de acceso (lista negra, path traversal, modos), redacción, y
las capacidades reales del servidor levantándolo por stdio como haría Claude.
