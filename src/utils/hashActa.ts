import { createHash } from 'node:crypto';

export interface ContenidoActa {
  votacionId: number;
  totalVotantes: number;
  validos: number;
  blancos: number;
  nulos: number;
  ganadora: string | null;
  fechaEmision: string;
}

/** Representación estable compartida conceptualmente con la migración MySQL. */
export function contenidoCanonicoActa(acta: ContenidoActa): string {
  const ganadoraHex = Buffer.from(acta.ganadora ?? '', 'utf8').toString('hex').toUpperCase();
  return [
    'codevote-acta:v1',
    `votacion:${acta.votacionId}`,
    `total_votantes:${acta.totalVotantes}`,
    `votos_validos:${acta.validos}`,
    `votos_blanco:${acta.blancos}`,
    `votos_nulos:${acta.nulos}`,
    `lista_ganadora_hex:${ganadoraHex}`,
    `fecha_emision:${acta.fechaEmision}`,
  ].join('\n');
}

export function hashActa(acta: ContenidoActa): string {
  return createHash('sha256').update(contenidoCanonicoActa(acta), 'utf8').digest('hex');
}

export function hashActaEsValido(acta: ContenidoActa, hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash) && hashActa(acta) === hash.toLowerCase();
}
