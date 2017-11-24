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

    // subscribe to all ticker pairs having NEO as currency on Bittrex
    client.getPairs('bittrex', {currency:'NEO'}, function(result, error){
        if (null !== error)
        {
            console.error(`Could not retrieve pairs : ${JSON.stringify(error)}`);
            client.disconnect();
            process.exit(1);
            return;
        }
        client.subscribeToTickers('bittrex', Object.keys(result));
    });
});

//-- Process notifications
// tickers notifications
client.on('ticker', function(evt){
    console.log(`\n=== Got '${evt.pair}' 'ticker' event from '${evt.exchange}' === `);
    console.log(evt);
});
