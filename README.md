# crypto-exchanges-ws-client

Node.js implementation of websocket protocol used by [Crypto Exchange Gateway](https://github.com/aloysius-pgast/crypto-exchanges-gateway)

## What it does

* Implement methods for subscribing to tickers, order books, trade, klines for Bittrex, Poloniex, Binance, Kucoin & OKex (all exchanges supported by [Crypto Exchange Gateway](https://github.com/aloysius-pgast/crypto-exchanges-gateway))

* Implement methods for subscribing to klines

* Implement method to subscribe to Ticker Monitor (custom price alerts) feed

* Handle automatic reconnection in (I think !) every possible scenario

## Installation

```
npm install crypto-exchanges-ws-client
```

## How to use it

See [documentation in _doc_ directory](https://github.com/aloysius-pgast/crypto-exchanges-ws-client-nodejs/tree/master/doc/) for a description of supported API

See [examples in _examples_ directory](https://github.com/aloysius-pgast/crypto-exchanges-ws-client-nodejs/tree/master/examples/) for an overview of what this library can do

## Code sample

Subscribe to `4h` & `1d` klines, for `USDT-BTC` & `USDT-ETH` pairs on `Binance` & `Kucoin` exchanges

Example assume that [Crypto Exchange Gateway](https://github.com/aloysius-pgast/crypto-exchanges-gateway) is running locally on ports *8000* & *8001*

```
"use strict";
const WebSocket = require('crypto-exchanges-ws-client');

const exchanges = ['binance', 'kucoin'];
const pairs = ['USDT-BTC', 'USDT-ETH'];
const klinesInterval = ['4h', '1d'];

const uri = 'ws://127.0.0.1:8001';
const client = new WebSocket(uri);

client.on('connected', (data) => {
    console.log(`We connected/reconnected : ${JSON.stringify(data)}`);
});

// connection to gateway was lost (reconnection will be automatic)
client.on('disconnected', (data) => {
    console.log(`We've been disconnected : ${JSON.stringify(data)}`);
});

client.on('ready', (data) => {
    console.log(`Ready to subscribe : ${JSON.stringify(data)}`);
    for (let exchange of exchanges) {
        for (let pair of pairs) {
            for (let interval of klinesInterval) {
                client.subscribeToKlines(exchange, pairs, interval);
            }
        }
    }
});

client.on('kline', (evt) => {
    console.log(JSON.stringify(evt));
});
```

Output should be similar to

```
We connected/reconnected : {"connectionId":1}                                                                                                                                                                                                
Ready to subscribe : {"sessionId":"rpc.bdff7468-5c7d-412f-a44a-4b37dab2ecc8","isNew":true}                                                                                                                                                   
{"exchange":"kucoin","pair":"USDT-BTC","interval":"1d","data":{"timestamp":1567987200,"open":10384.3,"high":10403.1,"low":10242.5,"close":10268.7,"volume":646.80699337,"remainingTime":61621,"closed":false}}                               
{"exchange":"kucoin","pair":"USDT-ETH","interval":"1d","data":{"timestamp":1567987200,"open":181.29,"high":181.6,"low":177,"close":177.44,"volume":20139.11233964,"remainingTime":61621,"closed":false}}                                     
{"exchange":"kucoin","pair":"USDT-BTC","interval":"1d","data":{"timestamp":1567987200,"open":10384.3,"high":10403.1,"low":10242.5,"close":10271.2,"volume":646.93397568,"remainingTime":61621,"closed":false}}                               
{"exchange":"kucoin","pair":"USDT-ETH","interval":"1d","data":{"timestamp":1567987200,"open":181.29,"high":181.6,"low":177,"close":177.44,"volume":20139.11667794,"remainingTime":61621,"closed":false}}                                     
{"pair":"USDT-BTC","interval":"4h","data":{"timestamp":1568001600,"open":10300.22,"close":10271.88,"high":10330.33,"low":10250.01,"volume":4470.045063,"remainingTime":4017,"closed":false},"exchange":"binance"}                            
{"pair":"USDT-BTC","interval":"1d","data":{"timestamp":1567987200,"open":10381.24,"close":10271.88,"high":10404.74,"low":10250.01,"volume":8118.81537,"remainingTime":61617,"closed":false},"exchange":"binance"}                            
{"pair":"USDT-ETH","interval":"1d","data":{"timestamp":1567987200,"open":181.18,"close":177.64,"high":181.65,"low":177,"volume":70992.51618,"remainingTime":61617,"closed":false},"exchange":"binance"}
{"pair":"USDT-ETH","interval":"4h","data":{"timestamp":1568001600,"open":178.25,"close":177.64,"high":179.01,"low":177,"volume":29569.11772,"remainingTime":4017,"closed":false},"exchange":"binance"}
{"pair":"USDT-BTC","interval":"4h","data":{"timestamp":1568001600,"open":10300.22,"close":10275.1,"high":10330.33,"low":10250.01,"volume":4470.410513,"remainingTime":4015,"closed":false},"exchange":"binance"}
{"pair":"USDT-BTC","interval":"1d","data":{"timestamp":1567987200,"open":10381.24,"close":10275.1,"high":10404.74,"low":10250.01,"volume":8119.18082,"remainingTime":61615,"closed":false},"exchange":"binance"}
{"pair":"USDT-ETH","interval":"1d","data":{"timestamp":1567987200,"open":181.18,"close":177.64,"high":181.65,"low":177,"volume":71009.36855,"remainingTime":61615,"closed":false},"exchange":"binance"}
{"pair":"USDT-ETH","interval":"4h","data":{"timestamp":1568001600,"open":178.25,"close":177.64,"high":179.01,"low":177,"volume":29585.97009,"remainingTime":4015,"closed":false},"exchange":"binance"}
{"pair":"USDT-BTC","interval":"4h","data":{"timestamp":1568001600,"open":10300.22,"close":10275.2,"high":10330.33,"low":10250.01,"volume":4471.59265,"remainingTime":4013,"closed":false},"exchange":"binance"}
{"pair":"USDT-BTC","interval":"1d","data":{"timestamp":1567987200,"open":10381.24,"close":10275.2,"high":10404.74,"low":10250.01,"volume":8120.362957,"remainingTime":61613,"closed":false},"exchange":"binance"}
{"pair":"USDT-ETH","interval":"1d","data":{"timestamp":1567987200,"open":181.18,"close":177.63,"high":181.65,"low":177,"volume":71009.43655,"remainingTime":61612,"closed":false},"exchange":"binance"}
{"pair":"USDT-ETH","interval":"4h","data":{"timestamp":1568001600,"open":178.25,"close":177.63,"high":179.01,"low":177,"volume":29586.03809,"remainingTime":4012,"closed":false},"exchange":"binance"}
```
