"use strict";
const WebSocketClient = require('../lib/client');

/*
 * Below example assumes that your gateway is listening for WS on 127.0.0.1:8001
 */

const uri = 'ws://127.0.0.1:8001'
const options = {
    tickerMonitor:{
        enabled:true,
        // ask to receive a notification when alerts become active or inactive (default = ['active'])
        types:{active:true,inactive:true},
        // ask to receive initial state of each alert upon connection/reconnection
        getInitialState:true
    }
}
const client = new WebSocketClient(uri, options);

//-- Process notifications
client.on('tickerMonitor', function(evt){
    console.log(`\n=== Alert '${evt.name}' (${evt.id}) became '${evt.status.value}' on ${new Date(evt.status.timestamp * 1000).toLocaleString()} === `);
});
