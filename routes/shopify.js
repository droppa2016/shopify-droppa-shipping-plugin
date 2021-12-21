"use strict";

const shopifyRoute = require('express').Router();
const cookie = require('cookie');
const url = require('url');
const querystring = require('querystring');
const request = require('request-promise');
const nonce = require('nonce');
const cors = require('cors');
const fetch = require('node-fetch');

const verify_query_string = require('../utility/Verify');
const ErrorResponse = require('../utility/errorResponse');
const asyncHandler = require('../middleware/async');

const ShopifyAPI = require('shopify-api-node');

let Order = require('../model/Order');
let StoreSetting = require('../model/StoreSetting');
let WebHook = require('../model/Webhook');
let AppSetting = require('../model/AppSetting');

let accessToken;

/** 
 * @description - Redirect to the app store
 * @Route       - GET
 * */
shopifyRoute.get('/app?shop=', (req, res) => {
    if (!req.query.shop) return res.redirect(`https://accounts.shopify.com/store-login`);
    return res.redirect(req.query.shop)
});
/**
 * @description     - Run Shopify Install
 * @Route           - GET shopify/install
 * @access          - Private
 */
shopifyRoute.get('/install', asyncHandler(async (req, res, next) => {
    const shop = req.query;
    const state = nonce();

    if (!shop) return next(new ErrorResponse('Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request', 400));

    const installURI = `https://${shop.shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=${process.env.SHOPIFY_SCOPE}&state=${state}&redirect_uri=${process.env.SHOPIFY_REDIRECT_URI}`;

    res.cookie('state', state);
    return res.redirect(installURI);

    res.cookie('state', state);
    return res.redirect(redirectURI);
}));
/**
 * @description     - Returns shipping rates based to carrier_service callback payload on Origin/Destination postal codes + products weight
 * @Route           - POST /get_rates
 * @access          - Private
 */
shopifyRoute.post('/get_rates', asyncHandler(async (req, res) => {

    let { subtotal, qtAmount, jsonResData } = 0;
    /** 
     * * date('Y-m-d H:i:s',strtotime("+".$totalDays." day", time())); 
     * * set zeros to show only  shipping name
     * */
    let { min_delivery_date, max_delivery_date } = "0000-00-00 00:00:00 -0000"

    let rateBodyObject = { mass: 0, dimensions: new Array() }

    req.body.rate.items.forEach(item => {

        // totalGrams += (parseInt(item.grams) * parseInt(item.quantity));
        subtotal = (parseInt(item.grams) * parseInt(item.quantity));//take qty into consideration
        subtotal = parseInt(subtotal / 1000);//convert to KG

        rateBodyObject.mass = subtotal;

        rateBodyObject.dimensions.push({
            parcel_length: 0,
            parcel_breadth: 0,
            parcel_height: 0,
            parcel_mass: subtotal
        });
    });

    let options = {
        'method': 'POST',
        'url': process.env.DROPPA_MASS_PRICES,
        'headers': {
            'Content-Type': 'application/json',
            'Authorization': process.env.DROPPA_AUTHORIZATION
        },
        body: JSON.stringify(rateBodyObject)
    };
    // Hit the service to generate proper Rates
    await request(options)
        .then((res_droppaApi) => {
            jsonResData = JSON.parse(res_droppaApi);
            //shopify assume last 2 digits to be cents
            qtAmount = (parseFloat(jsonResData.price).toFixed(2)) * 100;
            //send back the rates
            return res.status(200).json({
                "rates": [{
                    "service_name": process.env.DROPPA_SERVICE_NAME,
                    "service_code": "1D",
                    "total_price": qtAmount,
                    "currency": "ZAR",
                    "min_delivery_date": min_delivery_date,
                    "max_delivery_date": max_delivery_date
                }]
            });
        })
        .catch((error) => res.json({ "rates": [], error }))

}));
/**
 * @description     - Loads up a token once the redirect has been successful
 * @Route           - GET shopify/callback
 * @access          - Private
 */
shopifyRoute.get('/callback', asyncHandler(async (req, res, next) => {

    const { shop, hmac, code, state, host } = req.query;
    const regex = /^[a-z\d_.-]+[.]myshopify[.]com$/;

    let securityPass = false;

    if (shop.match(regex)) securityPass = true; else securityPass = false;

    let urlObj = url.parse(req.url);
    let query = urlObj.search.slice(1);

    if (verify_query_string(query)) securityPass = true; else securityPass = false;

    if (securityPass && regex) {

        let { get_access_token, get_app_scopes, shopRequestUrl, strStoreName, _shopifyAPI } = '';
        let accessTokenRequestUrl = `https://${shop}/admin/oauth/access_token`;

        let accessTokenPayload = {
            client_id: process.env.SHOPIFY_API_KEY,
            client_secret: process.env.SHOPIFY_API_SECRET_KEY,
            code,
        };
        // GET THE ACCESS_TOKEN & SCOPES
        let node_fetch_installer = await request.post(accessTokenRequestUrl, { json: accessTokenPayload })

        if (!node_fetch_installer) return res.status(500).json({ errorMessage: 'Error Occured Installting The App' });
        get_access_token = node_fetch_installer.access_token;

        if (!get_access_token.length > 0) return res.status(500).json({ errorMessage: 'Invalid access token.', errorStatusCode: 403 });

        shopRequestUrl = `https://${shop}/admin/api/2021-10/shop.json`;

        let strSubdomain = shopRequestUrl;

        strSubdomain = strSubdomain.substring(8, strSubdomain.indexOf(".myshopify"));

        _shopifyAPI = new ShopifyAPI({ shopName: strSubdomain, accessToken: get_access_token });

        await _shopifyAPI.shop.get()
            .then((theShop) => {

                var update = {
                    access_token: get_access_token,
                    storeLegalName: theShop.name,
                    // carrierServiceID: createdCarrierService.id,
                    shopify_store_id: theShop.id,
                    shopify_store_email: theShop.email,
                    shopify_store_address1: theShop.address1,
                    shopify_store_address2: theShop.address2,
                    shopify_store_zipCode: theShop.zip,
                    shopify_store_city: theShop.city,
                    shopify_store_province: theShop.province,
                    shopify_store_long: theShop.longitude,
                    shopify_store_lat: theShop.latitude,
                    droppa_api_key: '',
                    droppa_serviceid: ''
                };

                var insertObj = {
                    storeName: `${shop}`,
                    access_token: get_access_token,
                    // carrierServiceID: createdCarrierService.id,
                    droppa_api_key: '',
                    droppa_serviceid: '',
                    callback_payload_raw: '',
                    shopify_store_id: theShop.id,
                    shopify_store_email: theShop.email,
                    shopify_store_address1: theShop.address1,
                    shopify_store_address2: theShop.address2,
                    shopify_store_zipCode: theShop.zip,
                    shopify_store_city: theShop.city,
                    shopify_store_province: theShop.province,
                    shopify_store_long: theShop.longitude,
                    shopify_store_lat: theShop.latitude,
                    droppa_api_key: '',
                    droppa_serviceid: ''
                }

                StoreSetting.findOneAndUpdate({ 'storeName': `${shop}` }, update, { upsert: true, new: true }, (error, result) => {
                    if (!error) {
                        // If the document doesn't exist
                        if (!result) {
                            // Create it
                            result = new StoreSetting(insertObj);
                        }
                        // Save the document
                        result.save(function (error) {
                            if (!error) {
                                // return res.redirect(`https://${shop}/admin/apps/droppa`);
                            } else {
                                throw error;
                            }
                        });
                    }
                });
            })
            .catch((theShopErrorCaught) => console.log({ errorMessage: 'Error Retrieving The Stores Information', errorStatusCode: 400 }));

        await _shopifyAPI.carrierService.create({
            name: 'Droppa Rate Provider',
            callback_url: process.env.APP_CARRIER_SERVICE_CALLBACKURL,
            service_discovery: true
        })
            .then(async (createdCarrierService) => {

            })
            .catch((carrierErrorCaught) => /*console.log({ errorMessage: 'Error Creating Shopify Carrier Call.', errorStatusCode: 400 })*/ { });

        await _shopifyAPI.webhook.create({
            topic: 'app/uninstalled',
            address: `https://${req.get('host')}`,
            format: 'json',
            metafield_namespaces: [],
            private_metafield_namespaces: ['Droppa Shipping']
        })
            .then((droppaWebHook) => {

                const save = new WebHook(droppaWebHook);

                WebHook.findOneAndUpdate({ "access_token": get_access_token },
                    save,
                    { upsert: true }, (errorUpdating, _) => {
                        if (errorUpdating) console.log(errorUpdating);

                        res.status(200);
                    });
            })
            .catch((webhookErrorCaught) => /*console.log({ errorMessage: 'Error Creating Webhook.', errorStatusCode: 500 }) */ { });

        // 'Content-Security-Policy': `frame-ancestors "self" https://${shop}/admin/apps/droppa`
        await fetch(shopRequestUrl, {
            method: 'GET',
            headers: {
                'X-Shopify-Access-Token': get_access_token,
                'X-Frame-Options': 'sameorigin'
            }
        })
            .then((storeResults) => {

                if (storeResults) {
                    res.render('droppa', { shop: shop }, (error, htmlResults) => {
                        if (error) return res.json({ ErrorResponse: error });

                        return res.status(200).send(htmlResults);
                    })
                } else {
                    return res.redirect(`https://${shop}/admin/apps`);
                }

            })
            .catch((error) => res.status(error.statusCode).send(error.error.error_description));
    }
}));

/**
 * @description     - Navigate to the [Account] URL
 * @access          - Private
 * @method          - GET
 */
shopifyRoute.get('/account', asyncHandler(async (req, res) => {

    // console.log({ Account: req.query });
    res.render('thankYou', null, (error, htmlResults) => {
        if (error) return res.status(400).json({ ErrorResponse: error });

        return res.status(200).send(htmlResults)
    })
}));
/**
 * @description     - Navigate to the [Settings Panel] URL
 * @access          - Private
 * @method          - GET
 */
shopifyRoute.get('/settings_page', asyncHandler(async (req, res) => {

    res.render('app', { shop: req.query.shop }, (error, htmlResults) => {
        if (error) return res.status(400).json({ ErrorResponse: error });

        return res.send(htmlResults)
    });
}));
/**
 * @description     - Create an async await function
 * @param {*} URL 
 * @returns 
 */
async function postData(URL = '') {

    const response = await fetch(URL, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip'
        },
        redirect: 'follow',
        referrerPolicy: 'no-referrer'
    });

    return response.json();
}
/**
 * @description     - Get called whenever an order has been paid to trigger a booking
 * @Route           - POST /order_payment
 * @access          - Private
 */
shopifyRoute.post('/order_payment', asyncHandler(async (req, res) => {

    let orderID = '';
    let totalGrams = 0;
    let origin_location_zip = '';
    let shipping_lines_source = '';
    let pmass = 0;
    let fromProvinceCode = '';

    let { storeOrderExists, orderBookingExists, orderBookingConfirmationExists } = false;

    const reqData = req.body;

    reqData.shipping_lines.forEach(shipping_line => {

        try {
            shipping_lines_source = shipping_line.source;
        }
        catch (err) { shipping_lines_source = ''; }

        shipping_lines_source = shipping_lines_source.toUpperCase();
    });

    if ((shipping_lines_source.includes('DROPPA') == false) || (shipping_lines_source == '')) {
        return res.status(200).json(reqData);
    }

    //TODO: mongoose check if the booking has already beed made for the given order numner
    orderID = reqData.id;

    try {
        Order.findOne({ 'shopify_orderid': orderID }, function (err, result) {

            if (err) return res.status(400).json(err);

            res.status(200).json({ 'Order Model Results': result })

            // storeOrderExists = false;
            // orderBookingExists = false;
            // orderBookingConfirmationExists = false;

            // if (!result)//null check
            // {
            //     storeOrderExists = false;
            //     console.log("Null orderid record found")
            //     res.status(200);
            //     return;
            // }

            // if (err) {
            //     storeOrderExists = false;
            //     orderBookingExists = false;
            //     orderBookingConfirmationExists = false;

            //     console.error(err);
            //     res.status(200);
            //     return;
            // }

            // if (result.length == 0) {
            //     storeOrderExists = false;
            //     orderBookingExists = false;
            //     orderBookingConfirmationExists = false;

            //     console.log("No orderid record found")
            //     res.status(200);
            //     return;
            //     //return
            // }

            // if (result) //order number exist
            // {
            //     storeOrderExists = true;
            //     orderBookingExists = true;
            //     orderBookingConfirmationExists = true;
            //     console.log('booking exists, record=' + result);
            //     return;


            // } else {
            //     res.send(JSON.stringify({
            //         error: 'Error'
            //     }))
            //     res.status(200);
            //     return;
            // }
        })

    } catch (error) {
        console.error(error);
        res.status(200);
    }

    //check before proceeding with the booking if store misfired order payment confirmation
    if (orderBookingExists == true) {
        console.log('booking already exist for orderid=' + orderID);
        return res.status(200);
    }

    let domain = (new URL(reqData.order_status_url));

    let booking = {
        pickUpPCode: '',//
        dropOffPCode: '',//
        serviceId: '',//
        fromSuburb: '',//
        toSuburb: '',//
        platform: 'Shopify',
        province: '',//
        destinationProvince: '',//
        pickUpAddress: '',//
        dropOffAddress: '',//
        pickUpCompanyName: '',//
        dropOffCompanyName: '',//
        pickUpUnitNo: '',//
        dropOffUnitNo: '',//
        customerSurname: '',//
        customerName: '',//
        customerPhone: '',//
        customerEmail: '',//
        instructions: '',//
        price: 0,//
        parcelDimensions: new Array(),
        storeName: '',//,
        shopify_orderNo: ''
    }

    booking.shopify_orderNo = orderID;

    booking.storeName = domain.hostname;

    booking.pickUpPCode = '';//
    booking.serviceId = process.env.DROPPA_SERVICE_ID;

    try { booking.dropOffPCode = reqData.shipping_address.zip; } catch (err) { booking.dropOffPCode = 'unknown' }

    booking.fromSuburb = '';
    // Drop Off Postal Code And Suburb
    // ----------------------------------------------------------------------
    await postData(`${process.env.DROPPA_POSTAL_SUBURB}${reqData.shipping_address.zip}`)
        .then((results) => {
            booking.toSuburb = results.suburb.toUpperCase();
            return res.status(200);
        })
        .catch(errorToSuburb => console.log(errorToSuburb))
    // ----------------------------------------------------------------------

    booking.province = '';

    try { booking.destinationProvince = reqData.shipping_address.province; } catch (err) { booking.destinationProvince = 'unknown' }

    booking.pickUpAddress = '';//
    try { booking.dropOffAddress = reqData.shipping_address.address1; } catch (err) { booking.dropOffAddress = 'unknown' }

    booking.dropOffUnitNo = '';//
    try { booking.dropOffUnitNo = reqData.shipping_address.address2; } catch (err) { booking.dropOffUnitNo = '' }

    booking.pickUpCompanyName = '';//
    try { booking.dropOffCompanyName = reqData.shipping_address.company; } catch (err) { booking.dropOffCompanyName = 'unknown' }

    booking.pickUpUnitNo = '';//

    try { booking.customerSurname = reqData.customer.last_name; } catch (err) { booking.customerSurname = 'unknown' }
    try { booking.customerName = reqData.customer.first_name; } catch (err) { booking.customerName = 'unknown' }
    try { booking.customerPhone = reqData.customer.phone; } catch (err) { booking.customerPhone = 'unknown' }
    try { booking.customerEmail = reqData.customer.email; } catch (err) { booking.customerEmail = 'unknown' }

    try {
        booking.instructions = reqData.note;

        if (booking.instructions === null || booking.instructions === undefined)
            booking.instructions = '';

    } catch (err) { booking.instructions = '' }

    try { booking.price = reqData.total_shipping_price_set.shop_money.amount; } catch (err) { booking.price = 0 }

    reqData.line_items.forEach(line_item => {

        try { totalGrams = totalGrams + (parseInt(item.grams) * parseInt(item.quantity)); } catch (err) { totalGrams = 0 }

        try { origin_location_zip = line_item.origin_location.zip; } catch (err) { origin_location_zip = '' }
        try { booking.pickUpAddress = line_item.origin_location.address1 } catch (err) { booking.pickUpAddress = '' }
        // try { booking.fromSuburb = line_item.origin_location.city } catch (err) { booking.fromSuburb = '' }
        try { booking.pickUpUnitNo = line_item.origin_location.address2; } catch (err) { booking.pickUpUnitNo = '' }

        try {

            fromProvinceCode = line_item.origin_location.province_code;

            switch (fromProvinceCode) {
                case "EC":
                    booking.province = 'Eastern Cape';
                    break;
                case "FS":
                    booking.province = 'Free State';
                    break;
                case "GT":
                    booking.province = 'Gauteng';
                    break;

                case "NL":
                    booking.province = 'KwaZulu-Natal';
                    break;

                case "MP":
                    booking.province = 'Mpumalanga';
                    break;

                case "NW":
                    booking.province = 'North West';
                    break;

                case "NC":
                    booking.province = 'Northern Cape';
                    break;

                case "WC":
                    booking.province = 'Western Cape';
                    break;
                default:
                    booking.province = '';
            }
        } catch (err) { booking.province = '' }

        pmass = (parseInt(line_item.grams) / 1000) * (parseInt(line_item.quantity));

        //TODO: Dimensions not supported out of the box in shopify
        booking.parcelDimensions.push({
            parcel_length: 0,
            parcel_breadth: 0,
            parcel_height: 0,
            parcel_mass: pmass
        });
    });

    totalGrams = parseInt(totalGrams / 1000);

    booking.pickUpPCode = origin_location_zip;

    // Pick Up Postal Code And Suburb
    // ----------------------------------------------------------------------
    await postData(`${process.env.DROPPA_POSTAL_SUBURB}${origin_location_zip}`)
        .then((results) => {
            try { booking.fromSuburb = results.suburb.toUpperCase(); } catch (err) { booking.fromSuburb = '' }
            return res.status(200);
        })
        .catch(errorFromSuburb => console.log(errorFromSuburb))
    // ----------------------------------------------------------------------

    if (booking.pickUpUnitNo == '') {
        booking.pickUpAddress = booking.pickUpAddress + ", " + booking.pickUpPCode + ", South Africa"; //  + ", " + booking.fromSuburb +"," + booking.pickUpPCode;
    }
    else {
        booking.pickUpAddress = booking.pickUpAddress + ", " + booking.pickUpPCode + ", South Africa"; //  + ", " + booking.pickUpUnitNo  + "," + booking.fromSuburb +"," + booking.pickUpPCode;
    }
    if (booking.dropOffUnitNo == '') {
        booking.dropOffAddress = booking.dropOffAddress + ", " + booking.dropOffPCode + ", South Africa"; // + ", " + booking.toSuburb + "," + booking.dropOffPCode;
    }
    else {
        booking.dropOffAddress = booking.dropOffAddress + ", " + booking.dropOffPCode + ", South Africa"; // + ", " + booking.dropOffUnitNo + "," + booking.toSuburb + "," + booking.dropOffPCode;
    }

    let pickUpCompanyName = "";

    let subStoreName = "";
    subStoreName = booking.storeName;
    try {
        subStoreName = subStoreName.substring(8, subStoreName.indexOf(".myshopify"));

        await StoreSetting.findOne({ 'storeName': booking.storeName }, function (err, storeSetting) {
            if (err) return handleError(err);
            // console.log('Store DB settings')
            // console.log(storeSetting)
            pickUpCompanyName = storeSetting.storeLegalName;
        }).exec();

        if (!pickUpCompanyName == "") {
            booking.pickUpCompanyName = pickUpCompanyName;
        }
        else {
            booking.pickUpCompanyName = "";
        }
    }
    catch (err) {
        //document.getElementById("demo").innerHTML = err.message;
        console.log("error from  getStoreLegalName(storeName) = " + err);
    }

    let options = {
        'method': 'POST',
        'url': process.env.DROPPA_BOOKING,
        'headers': {
            'Content-Type': 'application/json',
            'Authorization': process.env.DROPPA_AUTHORIZATION
        },
        body: JSON.stringify(booking)
    };

    return request(options)
        .then(function (res_BookingApi) {
            if (res_BookingApi) {

                let respObj = JSON.parse(res_BookingApi);

                let bookingID = respObj.oid;

                let neworder_indb = new Order({
                    serviceId: process.env.DROPPA_SERVICE_ID,
                    shopify_orderid: orderID,
                    droppa_booking_oid: bookingID,
                    droppa_tracknumber: respObj.trackNo,
                    store_order_payload_raw: ''
                });

                neworder_indb.save(function (err, savedOrder) {
                    if (err) return console.error({ errorMessage: err });
                });

                if (orderBookingConfirmationExists) {
                    return res.status(200);
                }

                let bookingConfirmationOptions = {
                    'method': 'POST',
                    'url': `${process.env.DROPPA_BOOKING_CONFIRMATION}/${bookingID}`,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Authorization': process.env.DROPPA_AUTHORIZATION
                    },
                };

                request(bookingConfirmationOptions)
                    .then(function (res_ConfirmationApi) {
                        if (res_ConfirmationApi.oid) {
                            return res.statusCode(200);
                        }
                    })
                    .catch((err) => res.status(200).json({ 'Error Occured During Payment': err }));
            } else {
                return res.status(400);
            }
        })
        .catch((err) => res.status(200).json({ 'Error Occured While Creating A Booking': err }));

}));
/**
 * @description - Saves user Keys
 * @access      - Public
 * @method      - POST
 * @returns     - save_user_keys
 */
shopifyRoute.post('/save_user_keys', asyncHandler(async (req, res) => {

    let api_key = req.body.bodyData.droppa_api_key;
    let service_key = req.body.bodyData.droppa_api_secret_key;
    let store_name = req.body.bodyData.storeName;

    let newUserModel = {
        droppa_api_key: api_key,
        droppa_serviceid: service_key,
        storeName: store_name
    }

    const userStoreName = await StoreSetting.findOne({
        $or: [
            { storeName: `${newUserModel.storeName}` },
            { storeLegalName: `${newUserModel.storeName}` }
        ]
    }, (error, _) => {

        if (error) return res.json('Invalid Store Name, Please Contact The Droppa Support Team For Assistance.')
    });

    if (userStoreName.storeName) {
        return await StoreSetting.findOneAndUpdate(
            { storeName: newUserModel.storeName },
            newUserModel,
            { upsert: true, new: true },
            async (error, results) => {
                if (error) return res.status(400).json(error);

                const storeInformation = await StoreSetting.findOne({}).where('storeName').equals(results.storeName).exec();

                let _shopifyAPI = new ShopifyAPI({ shopName: storeInformation.storeName, accessToken: storeInformation.access_token });

                await _shopifyAPI.shop.get()
                    .then((theShop) => res.status(200).redirect(`/access/${theShop.domain}`))
                    .catch((theShopErrorCaught) => console.log({ errorMessage: 'Error Retrieving The Stores Information', errorStatusCode: 400, theShopErrorCaught }));
            });
    }
}));
/**
 * @description     - Navigate to the [Access Store Panel] URL
 * @access          - Private
 * @method          - GET
 */
shopifyRoute.get('/access/:store', asyncHandler(async (req, res) => {

    const storeInformation = await StoreSetting.findOne({}).where('storeName').equals(req.query.shop).exec();

    let _shopifyAPI = new ShopifyAPI({ shopName: storeInformation.storeName, accessToken: storeInformation.access_token });

    await _shopifyAPI.shop.get()
        .then((theShop) => {

            res.status(200).render('blank', { store: theShop }, (error, htmlResults) => {
                if (error) return res.status(400).json({ ErrorResponse: error });

                return res.send(htmlResults)
            });
        })
        .catch((theShopErrorCaught) => console.log({ errorMessage: 'Error Retrieving The Stores Information', errorStatusCode: 400, theShopErrorCaught }))
}));
//TODO: GDPR mandatory webhooks: Required when submitting the app to shopify for approval, like iOS apps
/**
 * @description     - Requests to view stored customer data. 
 *                    Called when a customer requests their data from a store owner,(e.g. customer orders data) : https://mystore.myshopify.com/admin/customers -> Customer privacy -> Request Customer Data
 * @Route           - GET customers/data_request
 * @access          - Private
 */
shopifyRoute.get('/customers/data_request', asyncHandler(async (req, res, next) => {

    Order.find({}, (error, results) => {
        if (error) return res.json(error);
        let newOrderArray = new Array;

        results.forEach((orders) => newOrderArray.push(orders.shopify_orderid));

        const getAllStoreOrders = {
            method: 'GET',
            uri: `${process.env.DROPPA_STORE_DATA_REQUEST}${newOrderArray}`,
            headers: {
                'Content-type': 'application/json',
                'Authorization': `${process.env.DROPPA_AUTHORIZATION}`
            }
        };

        return request(getAllStoreOrders)
            .then((totalOrders) => res.json(totalOrders))
            .catch((error) => res.json({ StatusCode: error.statusCode, Error: error.errors, Options: error.options, Pathname: error.pathname }));
    });
}));
/**
 * @description     - Requests deletion of customer data. Called when a store owner requests deletion of data on behalf of a customer
 * @Route           - GET /customers/redact
 * @access          - Private
 */
shopifyRoute.get('/customers/redact', asyncHandler(async (req, res, next) => {
    /*
     Request Payload : 
    {
       "shop_id": 954889,
       "shop_domain": "snowdevil.myshopify.com",
       "customer": {
           "id": 191167,
           "email": "john@email.com",
           "phone": "555-625-1199"
       },
       "orders_to_redact": [299938, 280263, 220458]
       }
     */
}));
/**
 * @description     - Requests deletion of shop data. Called 48 hours after an app is uninstalled by the store
 * @Route           - GET /shop/redact
 * @access          - Private
 */
shopifyRoute.get('/shop/redact', asyncHandler(async (req, res, next) => {
    StoreSetting.find({}, (error, results) => {

        if (error) return res.json(error);

        let storeNameOfTheStore;
        let shopifyStoreAccessToken;
        results.map((records) => {
            storeNameOfTheStore = records.storeName
            shopifyStoreAccessToken = records.access_token;
        });

        const remove_store_information = {
            method: 'DELETE',
            uri: `${process.env.DROPPA_STORE_REDUCT}${storeNameOfTheStore}`,
            headers: {
                'Content-type': 'application/json',
                'Authorization': `${process.env.DROPPA_AUTHORIZATION}`,
                'X-Shopify-Access-Token': shopifyStoreAccessToken
            }
        };

        return request(remove_store_information)
            .then((deleted_record) => {
                res.json(deleted_record)
            })
            .catch((error) => {
                res.json({
                    StatusCode: error.statusCode,
                    Error: error.errors,
                    Options: error.options,
                    Pathname: error.pathname
                })
            });
    });
}));
/**
 * @description     - Delete (uninstall) the app
 * @method          - POST
 * @access          - Private
 */
shopifyRoute.post('/', asyncHandler(async (req, res, next) => {

    const storeInformation = await StoreSetting.findOne({}).where('storeName').equals(req.body.domain).exec();

    if (storeInformation !== 'undefined') {

        const webhookInformation = await WebHook.findOne({}).where('access_token').equals(storeInformation.access_token).exec();
        const appSettingResults = await AppSetting.findOne({}).where('storeName').equals(req.body.domain).exec();

        removeUninstallWebhook(res, req.body.domain, storeInformation.access_token, webhookInformation.webhook_id);

        if (appSettingResults !== 'undefined') {
            await AppSetting.findOneAndDelete({
                storeName: req.body.domain
            }, (errorAppMessage, appSettingsResults) => {
                if (errorAppMessage) return res.json(errorMessage);
                console.log({ 'App Settings Object Removed': appSettingsResults });
                res.status(200);
            });
        }

        await WebHook.findOneAndDelete({ access_token: storeInformation.access_token },
            (errorMessage, webhookResults) => {
                if (errorMessage) return console.log(errorMessage);
                console.log({ 'Webhook Object Removed': webhookResults });
                res.status(200);
            });

        return await StoreSetting.findOneAndDelete({
            storeName: req.body.domain
        },
            (errorDeleting, _) => {
                if (!errorDeleting) return console.log(errorDeleting);
                console.log({ 'Successfully Deleted The Mongo Results': _ });
                res.status(200);
            });
    }

}));
/**
 * @description     - Create an App/Uninstall Webhook
 * @method          - POST
 * @access          - Private
 * @param {*} req 
 * @param {*} shop 
 * @param {*} access_token 
 */
async function createUninstallWebhook(req, res, shop, access_token) {

    let options = {
        method: 'POST',
        url: `https://${shop}/admin/api/2021-10/webhooks.json`,
        headers:
        {
            'content-type': 'application/json',
            'x-shopify-access-token': access_token,
            api_key: process.env.SHOPIFY_API_KEY,
            'cache-control': 'no-cache',
        },
        body: {
            webhook: {
                topic: 'app/uninstalled',
                address: `https://${req.get('host')}`,
                format: 'json',
                metafield_namespaces: [],
                private_metafield_namespaces: ['Droppa Shipping']
            }
        },
        json: true
    };

    request(options, function (error, response, body) {
        if (error) throw new Error(error.errors);

        const save = new WebHook(body.webhook);

        updateUninstallWebhook(req, res, shop, access_token, save.id);

        WebHook.findOneAndUpdate({ "access_token": access_token },
            save,
            { upsert: true }, (errorUpdating, _) => {
                if (errorUpdating) console.log(errorUpdating);

                // console.log({ 'Updated Webhook': _ });
                res.status(200);
            });
    });

}
/**
 * @description     - Update the App/Uninstall Webhook
 * @method          - PUT
 * @access          - Private
 * @param {*} req 
 * @param {*} shop 
 * @param {*} access_token 
 * @param {*} webhookId 
 */
async function updateUninstallWebhook(req, res, shop, access_token, webhookId) {
    var options = {
        method: 'PUT',
        url: `https://${shop}/admin/api/2021-10/webhooks/${webhookId}.json`,
        headers: {
            'cache-control': 'no-cache',
            'content-type': 'application/json',
            api_key: process.env.SHOPIFY_API_KEY,
            'x-shopify-access-token': access_token
        },
        body: {
            webhook: {
                id: webhookId,
                topic: 'app/uninstalled',
                address: `https://${req.get('host')}`
            }
        },
        json: true
    };

    request(options, function (error, response, body) {
        if (error) throw new Error(error);

        // console.log({ 'Updated The Webhook Function': body });
        res.status(200);
    });
}
/**
 * @description     - Removes the custom installed Webhook
 * @method          - DELETE
 * @access          - Private
 * @param {*} shop 
 * @param {*} access_token 
 * @param {*} webhook_id 
 */
async function removeUninstallWebhook(res, shop, access_token, webhook_id) {
    var options = {
        method: 'DELETE',
        url: `https://${shop}/admin/api/2021-10/webhooks/${webhook_id}.json`,
        headers: {
            'content-type': 'application/json',
            'x-shopify-access-token': access_token,
            api_key: process.env.SHOPIFY_API_KEY,
            'cache-control': 'no-cache',
        }
    };

    request(options, function (error, response, body) {
        if (error) throw new Error(error.errors);
        // console.log({ "Removed Webhook": body });
        res.status(200);
    });
}

function getLegalStoreNameFromDB(storeName) {
    //return new Promise((resolve,reject) => {

    console.log('getStoreAccessTokenFromDB fired storename=' + storeName);

    let storeLegalName = '';

    try {

        StoreSetting.findOne({ 'storeName': storeName }, function (err, storeSetting) {
            if (err) return handleError(err);

            storeLegalName = storeSetting.storeLegalName;

        });
    }
    catch (err) {
        storeLegalName = "";
        //reject(err.message);
    }
    console.log('getLegalStoreNameFromDB storeLegalName=' + storeLegalName);
    return storeLegalName;


}

async function getStoreLegalName(storeName, accessToken) {
    return new Promise((resolve, reject) => {

        console.log("getStoreLegalName fired with storeName=" + storeName);

        let strAccessToken = "";
        //strAccessToken =  getStoreAccessTokenFromDB(storeName);

        if (strAccessToken == '') {
            console.log('getStoreLegalName strAccessToken = getStoreAccessTokenFromDB(storeName) = null ');
        }



        let pickUpCompanyName = "";
        let subStorename = storeName.substring(0, storeName.indexOf(".myshopify"));

        console.log('Pre new ShopifyAPI() - subStorename = ' + subStorename + ' strAccessToken= ' + accessToken);

        let shopifyAPI = new ShopifyAPI({
            shopName: subStorename,
            accessToken: accessToken
        });

        console.log("let shopifyAPI = new ShopifyAPI created");

        shopifyAPI.shop.get()
            .then((shopGetResult) => {
                console.log("shopGetResult=" + shopGetResult);
                console.log("shopGetResult.name=" + shopGetResult.name);
                pickUpCompanyName = shopGetResult.name;
                console.log("pickUpCompanyName=" + pickUpCompanyName);
                //booking.pickUpCompanyName = shop.name;
                //
            })
            .catch((err) => {
                console.error("shopifyAPI.shop.get() error" + err);
                pickUpCompanyName = "";
                //res.status(200);
                reject(err.message);
            });

        resolve(pickUpCompanyName);
    });




}

module.exports = shopifyRoute;