
'use strict';

const path = require('node:path');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env')
});

const base = {
  username: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'conteofast',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5000),
  dialect: 'mysql',
  logging: false,

  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },

  dialectOptions: {
    connectTimeout: 10000
  }
};

module.exports = {
  development: { ...base },
  test: { ...base },
  production: { ...base }
};
