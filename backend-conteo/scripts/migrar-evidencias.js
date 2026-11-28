'use strict';
// Ejecutar con todas las instancias del API detenidas y copia de seguridad de MySQL.
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const storage = require('../services/evidencias-storage');
const tablas = [
  { tabla:'cf_registro_evidencias', porTipo:false },
  { tabla:'cf_registro_dignidad_evidencias', porTipo:true }
];
const select = {type:QueryTypes.SELECT};
const eliminarBlobs = process.argv.includes('--eliminar-blobs');
async function migrar() {
  await sequelize.authenticate();
  await storage.inicializar();
  for (const {tabla} of tablas) {
    const cols = await sequelize.query(`SHOW COLUMNS FROM ${tabla}`,select);
    if (!cols.some(c => c.Field==='ruta_archivo')) await sequelize.query(`ALTER TABLE ${tabla} ADD COLUMN ruta_archivo VARCHAR(512) NULL`);
  }
  for (const {tabla,porTipo} of tablas) {
    const cols = await sequelize.query(`SHOW COLUMNS FROM ${tabla}`,select);
    const tieneBlob = cols.some(c => c.Field==='imagen');
    // Cargar solo claves inicialmente, luego un BLOB a la vez (máximo una imagen en memoria).
    const claves = await sequelize.query(`SELECT registro_id${porTipo?',tipo':''} FROM ${tabla}`,select);
    let total=0;
    for (const clave of claves) {
      const where = `e.registro_id=:id${porTipo?' AND e.tipo=:tipo':''}`;
      const replacements = {id:clave.registro_id,...(porTipo?{tipo:clave.tipo}:{})};
      const [row] = await sequelize.query(`SELECT e.ruta_archivo,e.sha256,e.mime,e.tamano_bytes${tieneBlob?',e.imagen':''}, cr.eleccion_id,cr.junta_id,j.recinto_id
        FROM ${tabla} e JOIN cf_registros cr ON cr.id=e.registro_id JOIN juntas j ON j.id=cr.junta_id WHERE ${where}`,{...select,replacements});
      if (!row) throw new Error(`Registro sin relación válida: ${tabla}/${clave.registro_id}`);
      if (tieneBlob && row.imagen != null) {
        const foto = Buffer.isBuffer(row.imagen)?row.imagen:Buffer.from(row.imagen);
        if (storage.hash(foto)!==String(row.sha256).toLowerCase() || foto.length!==Number(row.tamano_bytes) || storage.mimeDe(foto)!==row.mime) throw new Error(`BLOB no coincide con metadatos: ${tabla}/${clave.registro_id}/${clave.tipo||'GENERAL'}`);
        const ruta = await storage.guardar({eleccionId:row.eleccion_id,recintoId:row.recinto_id,juntaId:row.junta_id,registroId:clave.registro_id,tipo:porTipo?clave.tipo:'GENERAL',foto,mime:row.mime});
        if (row.ruta_archivo!==ruta) {
          await sequelize.query(`UPDATE ${tabla} e SET ruta_archivo=:ruta, actualizado_en=actualizado_en WHERE ${where}`,{replacements:{...replacements,ruta}});
          row.ruta_archivo=ruta;
        }
      }
      await storage.leer(row);
      total++;
    }
    console.log(`${tabla}: ${total} archivos verificados (tamaño, formato y SHA-256).`);
  }
  // No eliminar ninguna columna hasta haber comprobado TODOS los archivos de ambas tablas.
  if (eliminarBlobs) {
    for (const {tabla} of tablas) {
      const cols = await sequelize.query(`SHOW COLUMNS FROM ${tabla}`,select);
      const [faltan] = await sequelize.query(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ruta_archivo IS NULL OR ruta_archivo=''`,select);
      if (Number(faltan.n)) throw new Error(`Rutas faltantes en ${tabla}`);
      await sequelize.query(`ALTER TABLE ${tabla} MODIFY COLUMN ruta_archivo VARCHAR(512) NOT NULL${cols.some(c=>c.Field==='imagen')?', DROP COLUMN imagen':''}`);
    }
    console.log('Migración completa: MySQL conserva rutas y metadatos, no imágenes.');
  } else console.log('BLOB originales conservados. Tras respaldar los archivos, repita con --eliminar-blobs.');
}
migrar().catch(e=>{console.error('Migración interrumpida:',e.message);process.exitCode=1;}).finally(()=>sequelize.close());
