const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const shopifyStoreSettingSchema = new Schema({
    storeName: {
        type: String,
        required: true,
        index: true,
        unique: true
    },
    access_token: {
        type: String,
        required: true,
        index: true,
        unique: true,
        dropDups: true
    },
    carrierServiceID: {
        type: String
    },
    droppa_api_key: {
        type: String
    },
    droppa_serviceid: {
        type: String
    },
    callback_payload_raw: {
        type: String
    },
    storeLegalName: {
        type: String
    },
    shopify_store_id: {
        type: String
    },
    shopify_store_email: {
        type: String
    },
    shopify_store_address1: {
        type: String
    },
    shopify_store_address2: {
        type: String
    },
    shopify_store_zipCode: {
        type: String
    },
    shopify_store_city: {
        type: String
    },
    shopify_store_province: {
        type: String
    },
    shopify_store_long: {
        type: String
    },
    shopify_store_lat: {
        type: String
    }
},
    { timestamps: true }
);

module.exports = mongoose.model('StoreSetting', shopifyStoreSettingSchema)