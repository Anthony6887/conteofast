'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
test('alcaldes en ambos ámbitos; concejales y vocales no cambian',()=>{
  const cargar=Module._load;
  Module._load=function(nombre,...args){if(nombre==='sequelize')return {QueryTypes:{}};if(nombre==='../models')return {sequelize:{}};return cargar.call(this,nombre,...args);};
  let reglas;
  try {reglas=require('../controllers/conteofast.controller')._internals;} finally {Module._load=cargar;}
  const listas=['3','4','6-8','7','18','20','21','61','62'];
  const alcaldes=listas.map((numero_lista,i)=>({id:i+1,tipo:'ALCALDE',numero_lista,nombre:numero_lista==='4'?'JUAN MEDINA':'ALCALDE'}));
  const candidatos=[...alcaldes,{id:10,tipo:'CONCEJAL',numero_lista:'4',ambito:'RURAL'},{id:11,tipo:'CONCEJAL',numero_lista:'4',ambito:'URBANO'},{id:29,tipo:'CONCEJAL',numero_lista:'1',ambito:'RURAL'}];
  const r=reglas.candidatosPermitidos(candidatos,{ambito:'RURAL',codigo:3320});
  const u=reglas.candidatosPermitidos(candidatos,{ambito:'URBANO',codigo:123});
  assert.equal(r.filter(c=>c.tipo==='ALCALDE').length,9);
  assert.equal(u.filter(c=>c.tipo==='ALCALDE').length,9);
  assert.ok(r.some(c=>c.nombre==='JUAN MEDINA'));
  assert.ok(!r.some(c=>c.id===10)); assert.ok(u.some(c=>c.id===11)); assert.ok(r.some(c=>c.id===29));
});
