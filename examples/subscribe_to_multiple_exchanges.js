"use strict";
const WebSocketClient = require('../lib/client');

/*
 * Below example assumes that your gateway is listening for WS on 127.0.0.1:8001
 */

const uri = 'ws://127.0.0.1:8001'
const client = new WebSocketClient(uri);

//-- Connection event handlers
// socket is connected but not ready to receive subscription yet
client.on('connected', function(data){
    console.log(`We connected/reconnected : ${JSON.stringify(data)}`);
});
// connection to gateway was lost (reconnection will be automatic)
client.on('disconnected', function(data){
    console.log(`We've been disconnected : ${JSON.stringify(data)}`);
});
// temporary connection error, retry will be automatic
client.on('connectionError', function(data){
    console.log(`Connection error : ${JSON.stringify(data)}`);
});
// this is were we can start subscriptions
client.on('ready', function(data){
    console.log(`Ready to subscribe : ${JSON.stringify(data)}`);

    // subscribe to USDT-BTC & USDT-ETH tickers on Poloniex
    client.subscribeToTickers('poloniex', ['USDT-BTC','USDT-ETH']);

    // subscribe to USDT-NEO order book on Bittrex
    client.subscribeToOrderBooks('bittrex', ['USDT-NEO']);

    // subscribe to BTC-NEO trades on Binance
    client.subscribeToTrades('binance', ['BTC-NEO']);

    // after 30s, ask to resync order book
    setTimeout(function(){
        client.resyncOrderBooks('bittrex', ['USDT-NEO']);
    }, 30000);
});

//-- Process notifications
// tickers notifications
client.on('ticker', function(evt){
    console.log(this);
    console.log(`\n=== Got '${evt.pair}' 'ticker' event from '${evt.exchange}' === `);
    console.log(evt);
});

// order books notifications
client.on('orderBook', function(evt){
    console.log(`\n=== Got '${evt.pair}' 'orderBook' event from '${evt.exchange}' === `);
    // just display buy/sell size
    let obj = {
        exchange:evt.exchange,
        pair:evt.pair,
        cseq:evt.cseq,
        buySize:evt.data.buy.length,
        sellSize:evt.data.sell.length
    }
    console.log(obj);
});
client.on('orderBookUpdate', function(evt){
    console.log(`\n=== Got '${evt.pair}' 'orderBookUpdate' event from '${evt.exchange}' === `);
    // just display buy/sell size
    let obj = {
        exchange:evt.exchange,
        pair:evt.pair,
        cseq:evt.cseq,
        buySize:evt.data.buy.length,
        sellSize:evt.data.sell.length
    }
    console.log(obj);
});

// trades notifications
client.on('trades', function(evt){
    console.log(`\n=== Got '${evt.pair}' 'trades' event from '${evt.exchange}' === `);
    // just display how many trades we're received
    let obj = {
        exchange:evt.exchange,
        pair:evt.pair,
        tradesSize:evt.data.length
    }
    console.log(evt);
});
