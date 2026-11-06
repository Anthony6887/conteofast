
'use strict';

const path = require('node:path');

require('dotenv').config({
    path: path.resolve(__dirname, '.env')
});

const express = require('express');
const cors = require('cors');

const db = require('./models');

const conteofastRoutes = require('./routes/conteofast.routes');

const app = express();
const PORT = Number(process.env.PORT || 5002);

/* ===========================================
   CONFIGURACIÓN
=========================================== */

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('Puerto inválido');
}

const origins = (
    process.env.CORS_ORIGINS ||
    'http://localhost:8100,http://localhost:3000'
)
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.disable('x-powered-by');

/* ===========================================
   CORS
=========================================== */

app.use(cors({
    origin(origin, callback) {
        if (!origin || origins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Origen no permitido por CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Registro-Clave'
    ]
}));

/* ===========================================
   MIDDLEWARES
=========================================== */

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

/* ===========================================
   INICIO
=========================================== */

app.get('/', (_req, res) => {
    return res.json({
        ok: true,
        aplicacion: 'ConteoFast',
        version: '1.0.0',
        mensaje: 'API funcionando'
    });
});

/* ===========================================
   CONEXIÓN MYSQL
=========================================== */

app.get('/api/health/db', async (_req, res) => {
    try {
        await db.sequelize.authenticate();

        return res.json({
            ok: true,
            message: 'MySQL conectado correctamente',
            database: process.env.DB_NAME || 'conteofast'
        });

    } catch (error) {
        console.error('[MYSQL]', error);

        return res.status(503).json({
            ok: false,
            message: 'No se pudo conectar a MySQL'
        });
    }
});

/* ===========================================
   API CONTEOFAST

   GET  /api/conteofast/catalogos
   GET  /api/conteofast/registro/:juntaId
   POST /api/conteofast/registro
   GET  /api/conteofast/resumen
=========================================== */

app.use('/api/conteofast', conteofastRoutes);

/* ===========================================
   RUTA NO ENCONTRADA
=========================================== */

app.use((_req, res) => {
    return res.status(404).json({
        ok: false,
        message: 'Ruta no encontrada'
    });
});

/* ===========================================
   MANEJO DE ERRORES
=========================================== */

app.use((error, _req, res, _next) => {
    console.error('[CONTEOFAST ERROR]', error);

    if (error.message === 'Origen no permitido por CORS') {
        return res.status(403).json({
            ok: false,
            message: 'Origen no permitido'
        });
    }

    if (error instanceof SyntaxError && error.status === 400) {
        return res.status(400).json({
            ok: false,
            message: 'JSON inválido'
        });
    }

    return res.status(500).json({
        ok: false,
        message: 'Error interno del servidor'
    });
});

/* ===========================================
   INICIAR SERVIDOR
=========================================== */

async function iniciar() {
    try {
        await db.sequelize.authenticate();

        console.log('');
        console.log('====================================');
        console.log('       CONTEOFAST BACKEND');
        console.log('====================================');
        console.log('[MYSQL] Conectado correctamente');

        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`[API] http://localhost:${PORT}`);
            console.log(`[API] http://localhost:${PORT}/api/health/db`);
            console.log(`[API] http://localhost:${PORT}/api/conteofast/catalogos`);
            console.log('====================================');
        });

        server.on('error', error => {
            console.error('[SERVIDOR]', error);
            process.exitCode = 1;
        });

    } catch (error) {
        console.error('[CONTEOFAST] Error iniciando:', error);
        process.exitCode = 1;
    }
}

void iniciar();
