/** Utilidades de cor usadas pelos dois renderizadores (mundo e avatar). */

/** Clareia (`amt > 0`) ou escurece (`amt < 0`) um hex, em direção a branco/preto. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(v + (target - v) * k),
  );
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function toNum(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Mistura duas cores hex (`t = 0` → a, `t = 1` → b). */
export function mix(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = [16, 8, 0].map((sh) => {
    const va = (na >> sh) & 255;
    const vb = (nb >> sh) & 255;
    return Math.round(va + (vb - va) * t);
  });
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Cor de texto legível sobre um fundo. Usa luminância relativa em vez de um
 * limiar sobre o valor bruto: `#00ff00` e `#0000ff` têm o mesmo "valor" e
 * luminâncias completamente diferentes.
 */
export function readableInk(background: string): '#0b0d12' | '#ffffff' {
  const n = parseInt(background.slice(1), 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return luminance > 0.45 ? '#0b0d12' : '#ffffff';
}

/** Cor determinística a partir de um texto — usada para o ponto do roster. */
export function colorFromString(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  const palette = [
    '#2f7de1',
    '#e14b4b',
    '#3fae63',
    '#f0a92b',
    '#8e5cd9',
    '#20b6c9',
    '#e26fa8',
    '#f07a1f',
  ];
  return palette[Math.abs(hash) % palette.length]!;
}
