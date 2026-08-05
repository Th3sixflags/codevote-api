/**
 * Cliente HTTP hacia la API CodeVote.
 *
 * Decisión de arquitectura: el MCP habla con la API REST, NO con MySQL.
 * Podría conectarse a la base directamente y sería más rápido, pero entonces
 * se saltaría todo el control que ya vive en el backend — JWT, rol admin,
 * segmentación por carrera, el bloqueo de borrado con evidencia electoral, el
 * secreto del voto. Al pasar por la API, el MCP hereda esas reglas en vez de
 * reimplementarlas (y en vez de olvidarse de alguna).
 *
 * Sobre la sesión: la API accede con un código de un solo uso enviado al correo
 * institucional, así que el servidor MCP no puede autenticarse por su cuenta —
 * nadie va a leerle el correo a un proceso. Recibe un JWT ya emitido por el
 * entorno (`npm run token` lo genera) y lo usa tal cual. El token vive en
 * memoria, el modelo no lo ve y no aparece en ninguna respuesta de herramienta.
 */
import type { Config } from './config.js';
import { autorizar, ErrorPolitica, type Metodo } from './politica.js';
import { LimitadorLocal } from './rate-limit.js';
import { leerToken, minutosRestantes, estaVencido, COMO_RENOVAR, type CargaJwt } from './jwt.js';
import { log } from './logger.js';

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

interface OpcionesPeticion {
  query?: Record<string, string | number | undefined>;
  cuerpo?: unknown;
  /** Sube el tope de bytes solo para esta petición (p. ej. el propio OpenAPI). */
  topeBytes?: number;
}

export class ClienteCodeVote {
  private readonly limitador: LimitadorLocal;
  private readonly sesion: CargaJwt;

  constructor(private readonly config: Config) {
    this.limitador = new LimitadorLocal(config.rateMax, config.rateWindowMs);
    // Si el token está mal formado, que reviente aquí y no en la primera
    // herramienta: el mensaje es mucho más útil en el arranque.
    this.sesion = leerToken(config.token);
  }

  /** Identidad efectiva del MCP, leída del token. Nunca incluye el token. */
  get identidad() {
    return {
      cedula: this.sesion.sub,
      correo: this.sesion.email,
      rol: this.sesion.rol,
      minutos_para_caducar: minutosRestantes(this.sesion),
    };
  }

  get cupoDisponible(): number {
    return this.limitador.disponibles;
  }

  /**
   * Comprueba antes de aceptar la primera herramienta que el token sirve y que
   * la API responde. Un servidor que arranca "bien" y falla en la primera
   * consulta es mucho más difícil de diagnosticar desde el cliente.
   */
  async verificarArranque(): Promise<void> {
    if (estaVencido(this.sesion)) {
      throw new ErrorApi(`El CODEVOTE_TOKEN ya caducó. ${COMO_RENOVAR}`, 401);
    }

    // Una consulta autenticada real: /health no lleva token y no probaría nada.
    await this.pedir('GET', '/procesos-electorales');

    const minutos = minutosRestantes(this.sesion);
    log.info(`sesión activa como rol=${this.sesion.rol} (${this.sesion.email})`);
    if (minutos !== null) {
      const aviso = `el token caduca en ${minutos} min`;
      if (minutos < 30) log.warn(`${aviso}. ${COMO_RENOVAR}`);
      else log.info(aviso);
    }
  }

  // ------------------------------------------------------------- peticiones --

  /** Punto único de salida. Toda herramienta pasa por aquí. */
  async pedir<T = unknown>(metodo: Metodo, ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
    autorizar(metodo, ruta, this.config.modo);

    const espera = this.limitador.consumir();
    if (espera !== null) {
      throw new ErrorPolitica(
        `Límite local de peticiones alcanzado (${this.config.rateMax} por ${this.config.rateWindowMs / 1000}s). Reintenta en ~${espera}s.`,
      );
    }

    try {
      return (await this.enviar(metodo, ruta, opciones)) as T;
    } catch (error) {
      // No hay renovación automática posible: el acceso exige un código enviado
      // al correo y eso lo hace una persona. Lo único útil es decirlo claro.
      if (error instanceof ErrorApi && error.estado === 401) {
        throw new ErrorApi(`La sesión del MCP caducó o el token no es válido. ${COMO_RENOVAR}`, 401);
      }
      throw error;
    }
  }

  private async enviar(metodo: Metodo, ruta: string, opciones: OpcionesPeticion): Promise<unknown> {
    const url = new URL(this.config.apiUrl + ruta);
    for (const [clave, valor] of Object.entries(opciones.query ?? {})) {
      if (valor !== undefined && valor !== '') url.searchParams.set(clave, String(valor));
    }

    const cabeceras: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.config.token}`,
    };
    if (opciones.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

    const abortador = new AbortController();
    const temporizador = setTimeout(() => abortador.abort(), this.config.timeoutMs);

    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: metodo,
        headers: cabeceras,
        body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
        signal: abortador.signal,
        redirect: 'error', // un redirect podría sacar el JWT hacia otro host
      });
    } catch (error) {
      clearTimeout(temporizador);
      if ((error as Error).name === 'AbortError') {
        throw new ErrorApi(`La API no respondió en ${this.config.timeoutMs} ms.`, 504);
      }
      throw new ErrorApi(`No se pudo contactar la API (${(error as Error).message}).`, 502);
    }
    clearTimeout(temporizador);

    const texto = await this.leerConTope(respuesta, opciones.topeBytes ?? this.config.maxBytes);

    if (!respuesta.ok) {
      throw new ErrorApi(this.mensajeDeError(respuesta.status, texto), respuesta.status);
    }
    if (respuesta.status === 204 || texto.trim() === '') return null;

    try {
      return JSON.parse(texto);
    } catch {
      throw new ErrorApi('La API devolvió una respuesta que no es JSON válido.', 502);
    }
  }

  /**
   * Lee el cuerpo con un tope de bytes. Sin esto, un endpoint que devuelva
   * miles de filas puede agotar la memoria del proceso y, peor, inundar la
   * ventana de contexto del modelo.
   */
  private async leerConTope(respuesta: Response, tope: number): Promise<string> {
    const declarado = Number(respuesta.headers.get('content-length') ?? 0);
    if (declarado > tope) {
      throw new ErrorApi(
        `La respuesta (${declarado} bytes) supera el tope de ${tope}. Filtra la consulta.`,
        413,
      );
    }
    if (!respuesta.body) return '';

    const lector = respuesta.body.getReader();
    const trozos: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > tope) {
        await lector.cancel();
        throw new ErrorApi(`La respuesta supera el tope de ${tope} bytes. Filtra la consulta.`, 413);
      }
      trozos.push(value);
    }
    return Buffer.concat(trozos).toString('utf8');
  }

  /**
   * Normaliza el error. Se aprovecha el mensaje de la API (son en español y
   * explican bien el porqué) pero se recorta: nunca se devuelve un cuerpo
   * completo ni una traza, que es por donde se filtra información interna.
   */
  private mensajeDeError(estado: number, cuerpo: string): string {
    let detalle = '';
    try {
      const json = JSON.parse(cuerpo) as { error?: string; mensaje?: string };
      detalle = json.error ?? json.mensaje ?? '';
    } catch {
      /* cuerpo no-JSON: se ignora a propósito */
    }
    detalle = detalle.slice(0, 300);

    const base: Record<number, string> = {
      400: 'Solicitud inválida',
      401: 'La sesión del MCP no es válida',
      403: 'La cuenta del MCP no tiene permiso para esto',
      404: 'No encontrado',
      409: 'Conflicto con el estado actual del proceso',
      413: 'Respuesta demasiado grande',
      422: 'Datos que no pasan la validación de la API',
      429: 'La API aplicó su propio límite de peticiones',
      500: 'Error interno de la API',
    };
    const cabeza = base[estado] ?? `Error HTTP ${estado}`;
    return detalle ? `${cabeza}: ${detalle}` : cabeza;
  }
}
