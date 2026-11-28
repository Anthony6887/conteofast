'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const storage = require('../services/evidencias-storage');
test('almacenamiento persistente, rutas, reemplazo, integridad', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'conteofast-'));
  process.env.CF_EVIDENCIAS_DIR=dir;
  try {
    await storage.inicializar();
    const foto = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6uoAAAAASUVORK5CYII=','base64');
    const data={eleccionId:1,recintoId:2,juntaId:3,registroId:4,tipo:'ALCALDE',foto,mime:'image/png'};
    const ruta = await storage.guardar(data);
    assert.match(ruta,/^eleccion-1\/recinto-2\/junta-3\/ALCALDE\/registro-4\//);
    assert.equal(await storage.guardar(data),ruta);
    const meta={ruta_archivo:ruta,sha256:storage.hash(foto),mime:'image/png',tamano_bytes:foto.length};
    assert.deepEqual(await storage.leer(meta),foto);
    assert.equal(await storage.disponible(meta),true);
    assert.notEqual(await storage.guardar({...data,tipo:'VOCAL'}),ruta);
    assert.notEqual(await storage.guardar({...data,foto:Buffer.concat([foto,Buffer.from('x')])}),ruta);
    assert.deepEqual(await storage.leer(meta),foto);
    assert.throws(()=>storage.rutaAbsoluta('../../etc/passwd'));
    await fs.writeFile(storage.rutaAbsoluta(ruta),Buffer.alloc(foto.length));
    await assert.rejects(storage.leer(meta),/Integridad/);
    await fs.unlink(storage.rutaAbsoluta(ruta));
    assert.equal(await storage.disponible(meta),false);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
