/**
 * Limitador local de peticiones (token bucket).
 *
 * La API ya tiene su propio rate limit por IP, pero ese se aplica *después* de
 * que el tráfico salió. Este actúa antes: si el modelo entra en un bucle de
 * llamadas, el freno se aplica en el servidor MCP y la API ni se entera. Evita
 * además que el MCP consuma la cuota de la IP compartida y deje sin servicio al
 * frontend real.
 */
export class LimitadorLocal {
  private fichas: number;
  private ultimaRecarga = Date.now();

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number,
  ) {
    this.fichas = maximo;
  }

  private recargar() {
    const ahora = Date.now();
    const transcurrido = ahora - this.ultimaRecarga;
    if (transcurrido <= 0) return;
    const nuevas = (transcurrido / this.ventanaMs) * this.maximo;
    if (nuevas >= 1) {
      this.fichas = Math.min(this.maximo, this.fichas + nuevas);
      this.ultimaRecarga = ahora;
    }
  }

  /** Devuelve los segundos que faltan para poder reintentar, o null si hay cupo. */
  consumir(): number | null {
    this.recargar();
    if (this.fichas < 1) {
      const segundos = Math.ceil((this.ventanaMs / this.maximo) / 1000);
      return Math.max(1, segundos);
    }
    this.fichas -= 1;
    return null;
  }

  get disponibles(): number {
    this.recargar();
    return Math.floor(this.fichas);
  }
}
