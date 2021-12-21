'use strict';
const hmacValidator = require('hmac-validator');

/** Node HMAC Validator
 * @description the function receive a configuration object which define how the HMAC digest is calculated and return
 *              a function to validate the HMAC digest signature for different inputs.
 * @returns validate function to store in the app-store-api-password
*/
module.exports = (query_string) => {
    let validate = hmacValidator({
        replacements: {
            both: {
                '&': '%26',
                '%': '%25'
            },
            keys: {
                '=': '%3D',
                '^': '5E'
            },
            values: {
                '<': '#60',
                '>': '#62'
            }
        },
        excludedKeys: ['signature', 'hmac'],
        algorithm: 'sha256',
        format: 'hex',
        digestKey: 'hmac'
    });

    return validate(process.env.SHOPIFY_API_SECRET_KEY, null, query_string);
};

