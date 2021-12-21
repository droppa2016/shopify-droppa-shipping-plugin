const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const WebhookSchema = new Schema({
    id: {
        type: String,
        required: false
    },
    access_token: {
        type: String,
        required: false
    },
    address: {
        type: String
    },
    topic: {
        type: String
    },
    format: {
        type: String
    },
    api_version: {
        type: String
    }
},
    { timestamps: true }
);

module.exports = mongoose.model('Webhook', WebhookSchema)