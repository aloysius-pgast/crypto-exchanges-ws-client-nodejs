# crypto-exchanges-ws-client

Node.js implementation of websocket protocol used by [Crypto Exchange Gateway](https://github.com/aloysius-pgast/crypto-exchanges-gateway)

_NB_ : for the moment it **only works with branch _develop_** of the gateway

## What it does

* Implement methods for subscribing to tickers, order books & trade for Bittrex, Poloniex & Binance

* Implement methods for subscribing to klines (Binance only)

* Implement method to subscribe to Ticker Monitor (alerts) feed

* Handle automatic reconnection in (I think !) every possible scenario

## Installation

```
npm install crypto-exchanges-ws-client
```

## How to use it

See [documentation in _doc_ directory](https://github.com/aloysius-pgast/crypto-exchanges-ws-client-nodejs/tree/master/doc/) for a description of supported API

See [examples in _examples_ directory](https://github.com/aloysius-pgast/crypto-exchanges-ws-client-nodejs/tree/master/examples/) for an overview of what this library can do
