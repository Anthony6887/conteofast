/** Construcción de URL del backend; únicamente se utiliza en rutas del servidor Next. */
export function urlApiConteoFast(ruta: string): string {
  const configurado = (process.env.CONTEOFAST_API_BASE || process.env.CONTEOFAST_API_URL || process.env.NEXT_PUBLIC_CONTEOFAST_API_BASE || '').trim();
  if (!configurado) throw new Error('Configura CONTEOFAST_API_BASE en el servidor Next.js.');
  const url = new URL(configurado);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('CONTEOFAST_API_BASE debe utilizar HTTP o HTTPS.');
  }
  let base = url.pathname.replace(/\/+$/, '').replace(/\/(catalogos|resumen|recintos-estado|revision-actas)$/, '');
  if (!base.endsWith('/api/conteofast')) {
    base = base.endsWith('/api') ? `${base}/conteofast` : `${base}/api/conteofast`;
  }
  return `${url.origin}${base}/${ruta.replace(/^\/+/, '')}`;
}

export function validarIdJunta(id: string): number | null {
  if (!/^[1-9]\d{0,8}$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : null;
}

export const CABECERAS_PRIVADAS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};
