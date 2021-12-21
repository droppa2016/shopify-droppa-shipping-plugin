const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const shopifyOrderSchema = new Schema({
    serviceId: {
        type: String,
        required: true,
        index: true
    },
    shopify_orderid: {
        type: String,
        required: true,
        index: true,
        unique: true,
        dropDups: true
    },
    droppa_booking_oid: {
        type: String,
        unique: true,
        sparse: true
    },
    droppa_tracknumber: {
        type: String,
        unique: true,
        sparse: true
    },
    store_order_payload_raw: {
        type: String
    }
},
    { timestamps: true }
);

module.exports = mongoose.model('Order', shopifyOrderSchema)