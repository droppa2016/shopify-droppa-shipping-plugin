'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const colors = require('colors');

class mongodb_connection {
    connectParam = '';

    constructor() { }

    static async _connection() {

        this.connectParam = await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useCreateIndex: true,
            useUnifiedTopology: true,
            useFindAndModify: false
        });

        console.log(`MongoDB Connected On Port ${this.connectParam.connection.port}`.yellow);
    }
}

module.exports = mongodb_connection;