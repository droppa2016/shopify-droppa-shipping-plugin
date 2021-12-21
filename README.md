
# Droppa Shopify Shipping Plugin

A node project built to manipulate Droppa services to generate rates, make bookings and payments.




## Used By

This project is used by all registered Droppa Group clients.




## API Reference

#### GET Installation URL

```http
  GET /shopify/install
```

#### GET Callback after installation

```http
  GET /shopify/callback
```

| Parameter | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `SHOPIFY_ACCESS_TOKEN` | `string` | **Required**. Your Access key to load up the screen |

#### POST call to generate user rates

```http
  POST /shopify/get_rates
```

#### POST call to create bookings

```http
  POST /shopify/order_payment

## Environment Variables

To run this project, you will need to add the following environment variables to your .env file

> Variables used to install and load up the plugin
`SHOPIFY_APP_NAME`, `SHOPIFY_SCOPE`, `SHOPIFY_STORE_URI`, `SHOPIFY_REDIRECT_URI`

> Variables used to communicate with the Droppa Backend

`MONGO_URI`, `DROPPA_AUTHORIZATION`, `DROPPA_SERVICE_ID`, `DROPPA_SERVICE_NAME`
`APP_CARRIER_SERVICE_CALLBACKURL`, `DROPPA_BOOKING`, `DROPPA_BOOKING_CONFIRMATION`, `DROPPA_STORE_REDUCT`
`DROPPA_STORE_DATA_REQUEST`, `DROPPA_POSTAL_SUBURB`, `DROPPA_MASS_PRICES`
