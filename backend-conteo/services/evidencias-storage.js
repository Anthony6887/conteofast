'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const tipos = new Set(['GENERAL', 'ALCALDE', 'CONCEJAL', 'VOCAL']);
const extensiones = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
function raiz() {
  const dir = process.env.CF_EVIDENCIAS_DIR || (process.env.NODE_ENV === 'production' ? '/data/evidencias' : path.join(__dirname, '..', 'evidencias'));
  if (!path.isAbsolute(dir)) throw new Error('CF_EVIDENCIAS_DIR debe ser una ruta absoluta.');
  return dir;
}
function mimeDe(buf) {
  if (buf.length >= 8 && buf.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii',0,4) === 'RIFF' && buf.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  return null;
}
function rutaAbsoluta(rel) {
  if (typeof rel !== 'string' || !/^eleccion-[1-9]\d*\/recinto-[1-9]\d*\/junta-[1-9]\d*\/(GENERAL|ALCALDE|CONCEJAL|VOCAL)\/registro-[1-9]\d*\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(rel)) throw new Error('Ruta de evidencia inválida.');
  return path.join(raiz(), rel);
}
async function inicializar() {
  await fs.mkdir(raiz(), { recursive:true, mode:0o750 });
  const prueba = path.join(raiz(), `.prueba-${crypto.randomUUID()}`);
  await fs.writeFile(prueba, 'ok', { flag:'wx', mode:0o600 });
  await fs.unlink(prueba);
}
async function leer(meta) {
  const contenido = await fs.readFile(rutaAbsoluta(meta.ruta_archivo));
  if (contenido.length !== Number(meta.tamano_bytes) || hash(contenido) !== String(meta.sha256).toLowerCase() || mimeDe(contenido) !== meta.mime) throw new Error('Integridad de evidencia inválida.');
  return contenido;
}
async function disponible(meta) {
  try { const st = await fs.stat(rutaAbsoluta(meta.ruta_archivo)); return st.isFile() && st.size === Number(meta.tamano_bytes); } catch { return false; }
}
async function guardar({ eleccionId, recintoId, juntaId, registroId, tipo, foto, mime }) {
  if (![eleccionId,recintoId,juntaId,registroId].every(v => Number.isSafeInteger(Number(v)) && Number(v)>0) || !tipos.has(tipo) || !extensiones[mime] || !Buffer.isBuffer(foto) || mimeDe(foto)!==mime) throw new Error('Metadatos de evidencia inválidos.');
  const sha256 = hash(foto);
  const ruta_archivo = `eleccion-${Number(eleccionId)}/recinto-${Number(recintoId)}/junta-${Number(juntaId)}/${tipo}/registro-${Number(registroId)}/${sha256}.${extensiones[mime]}`;
  const destino = rutaAbsoluta(ruta_archivo);
  await fs.mkdir(path.dirname(destino), { recursive:true, mode:0o750 });
  const tmp = `${destino}.${crypto.randomUUID()}.tmp`;
  try {
    const fd = await fs.open(tmp,'wx',0o640);
    try { await fd.writeFile(foto); await fd.sync(); } finally { await fd.close(); }
    // Publicación atómica; no se reemplaza el archivo de otra evidencia.
    try { await fs.link(tmp,destino); } catch(e) { if(e.code !== 'EEXIST') throw e; }
    await leer({ruta_archivo,sha256,tamano_bytes:foto.length,mime});
  } finally { await fs.unlink(tmp).catch(e => { if(e.code !== 'ENOENT') throw e; }); }
  return ruta_archivo;
}
module.exports = { raiz, inicializar, guardar, leer, disponible, mimeDe, hash, rutaAbsoluta };
