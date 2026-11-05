const port = process.env.PORT || 5000;
const express = require('express');
const app = express();

const db = require('./models');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const path = require('path');
require('dotenv').config();

app.use(cors({
    origin: '*',  // Permite solicitudes desde cualquier origen
    methods: ['GET', 'POST', 'PUT', 'DELETE'],  // Métodos HTTP permitidos
    allowedHeaders: ['Content-Type', 'Authorization']  // Cabeceras permitidas
}));


app.use('/uploadsLogin', express.static(path.join(__dirname, '/uploadsLogin')));

app.use(express.json());

// Rutas
app.use('/api', authRoutes);

app.use((req, res, next) => {
    console.log('Received request:', req.method, req.url);
    next();
});

app.listen(port, () => {
    console.log(`Servidor HTTP corriendo en puerto: ${port} en modo ${process.env.NODE_ENV} ${process.env.DB_HOST}`);
});

// Conectar con la base de datos
db.sequelize
    .sync({ force: false })
    .then(() => {
        console.log('Conexión establecida correctamente.');
    })
    .catch(err => {
        console.error('No se puede conectar a la base de datos:', err);
    });
