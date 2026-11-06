'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Sequelize, DataTypes } = require('sequelize');

const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require('../config/config.js')[env];

if (!config) throw new Error(`NODE_ENV no reconocido: ${env}`);
if (!config.password) throw new Error('Falta DB_PASSWORD en el archivo .env');
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error('DB_PORT inválido');
}

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging,
    pool: config.pool,
    dialectOptions: config.dialectOptions,
    define: { freezeTableName: true, timestamps: false }
  }
);

const db = {};
fs.readdirSync(__dirname)
  .filter(file => file[0] !== '.' && file !== basename && file.endsWith('.js') && !file.endsWith('.test.js'))
  .forEach(file => {
    const imported = require(path.join(__dirname, file));
    if (typeof imported !== 'function') return;
    const model = imported(sequelize, DataTypes);
    db[model.name] = model;
  });

for (const modelName of Object.keys(db)) {
  if (typeof db[modelName].associate === 'function') {
    db[modelName].associate(db);
  }
}

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
