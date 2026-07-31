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
 * Sobre la sesión: las credenciales viven en el entorno del proceso MCP. El
 * modelo no las ve, no las pide y no puede pasarlas como argumento. El JWT se
 * guarda en memoria y tampoco se expone nunca en una respuesta de herramienta.
 */
import type { Config } from './config.js';
import { autorizar, ErrorPolitica, type Metodo } from './politica.js';
import { LimitadorLocal } from './rate-limit.js';
import { log } from './logger.js';

export interface Usuario {
  cedula: string;
  nombres: string;
  apellidos: string;
  rol: 'estudiante' | 'admin' | 'candidato';
}

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
  private token?: string;
  private usuario?: Usuario;
  private loginEnCurso?: Promise<void>;
  private readonly limitador: LimitadorLocal;

  constructor(private readonly config: Config) {
    this.limitador = new LimitadorLocal(config.rateMax, config.rateWindowMs);
    this.token = config.tokenFijo;
  }

  /** Identidad efectiva del MCP. Nunca incluye el token. */
  get identidad(): Usuario | undefined {
    return this.usuario;
  }

  get cupoDisponible(): number {
    return this.limitador.disponibles;
  }

  // ---------------------------------------------------------------- sesión --

  private async iniciarSesion(): Promise<void> {
    if (!this.config.credenciales) {
      // Con token preemitido no hay forma de renovar: que falle claro.
      throw new ErrorApi(
        'La sesión expiró y el servidor se configuró con CODEVOTE_TOKEN (no renovable). Reinícialo con credenciales.',
        401,
      );
    }
    const { correo, password } = this.config.credenciales;
    const respuesta = await this.enviar('POST', '/auth/login', {
      cuerpo: { correo_institucional: correo, password },
      sinAuth: true,
    });
    const datos = respuesta as { token?: string; usuario?: Usuario };
    if (!datos.token) throw new ErrorApi('La API no devolvió un token en el login.', 502);
    this.token = datos.token;
    this.usuario = datos.usuario;
    log.info(`sesión iniciada como rol=${datos.usuario?.rol ?? 'desconocido'}`);
  }

  /** Garantiza que hay token. Coalesce logins concurrentes en uno solo. */
  private async asegurarSesion(): Promise<void> {
    if (this.token) return;
    this.loginEnCurso ??= this.iniciarSesion().finally(() => {
      this.loginEnCurso = undefined;
    });
    await this.loginEnCurso;
  }

  /** Comprueba conectividad y credenciales al arrancar (fail fast). */
  async verificarArranque(): Promise<void> {
    await this.asegurarSesion();
    if (!this.usuario && this.token) {
      // Con CODEVOTE_TOKEN no conocemos la identidad; se deduce del primer uso.
      log.warn('token preemitido: la identidad del MCP no se pudo verificar en el arranque.');
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

    await this.asegurarSesion();

    try {
      return (await this.enviar(metodo, ruta, opciones)) as T;
    } catch (error) {
      // Un 401 casi siempre es el JWT expirado (la API los emite a 1h).
      // Se renueva y se reintenta UNA vez: sin bucle, para no convertir un
      // problema de credenciales en un ataque de fuerza bruta contra el login.
      if (error instanceof ErrorApi && error.estado === 401 && this.config.credenciales) {
        log.warn('401 de la API: renovando sesión y reintentando una vez.');
        this.token = undefined;
        await this.asegurarSesion();
        return (await this.enviar(metodo, ruta, opciones)) as T;
      }
      throw error;
    }
  }

  private async enviar(
    metodo: Metodo,
    ruta: string,
    opciones: OpcionesPeticion & { sinAuth?: boolean },
  ): Promise<unknown> {
    const url = new URL(this.config.apiUrl + ruta);
    for (const [clave, valor] of Object.entries(opciones.query ?? {})) {
      if (valor !== undefined && valor !== '') url.searchParams.set(clave, String(valor));
    }

    const cabeceras: Record<string, string> = { Accept: 'application/json' };
    if (!opciones.sinAuth && this.token) cabeceras.Authorization = `Bearer ${this.token}`;
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
