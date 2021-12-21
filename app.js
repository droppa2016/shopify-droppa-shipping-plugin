'use strict';

const dotenv = require('dotenv').config({
    path: './config.env'
});

const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const colors = require('colors');
const helmet = require("helmet");
const favicon = require('serve-favicon');

const errorHnadler = require('./middleware/error');
const mongodb_connection = require('./config/db');

const app = express();

// app.use(helmet.frameguard({ action: 'ALLOW' }));
// Parser
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
// EJS Templating
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.set('json spaces', 2)
// Database Connection
mongodb_connection._connection();
// Cross Site Middleware
app.use(
    cors({
        origin: '*',
        credentials: true,
        optionsSuccessStatus: 200
    })
);
// Loader
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    // res.header("X-Frame-Options", "SAMEORIGIN always");
    res.header("X-Content-Security-Policy", "frame-ancestors 'self'")
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Request-Methods", "POST, GET, PUT, DELETE");
    next();
});
// Middleware for development
if (process.env.NODE_ENV === 'production') {
    app.use(morgan('dev'));
}
// Static directory
// app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, "public", "index.html")));
app.use(express.static(path.join(__dirname, 'public')));
// Public routes
app.use('/', require('./routes/shopify'));
// Error handler Middleware
// app.use(errorHnadler);
// Run PORT for server connection
const PORT = process.env.PORT || 8000;
// Listen for the port
app.listen(PORT, () => console.log(`Running on port ${PORT} - ${process.env.NODE_ENV}`.red));
