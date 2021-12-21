const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const shopifyAppSettingSchema = new Schema({
    settingName: {
        type: String,
        required: true
    },
    storeName: {
        type: String,
        required: true,
        index: true,
        unique: true
    },
},
    { timestamps: true }
);

module.exports = mongoose.model('AppSetting', shopifyAppSettingSchema)