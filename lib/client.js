"use strict";
const debug = require('debug')('CEWSC:Client');
const EventEmitter = require('events');
const _ = require('lodash');
const url = require('url');
const querystring = require('querystring');
const WebSocketConnection = require('./websocket-connection');

// how long should we wait before trying to reconnect upon disconnection
const RETRY_DELAY = 10 * 1000;

class Client extends EventEmitter
{

/*
    Following events related to connection can be emitted

    1) connectionError, when a connection/reconnection error occurs (ie: WS cannot be connnected)

    Data will be an object {connectionId:integer,attempts:integer,error:err}

    - connectionId : id of WS connection
    - attempts : number of attempts to connect
    - error : the connection error which occurred

    Reconnection will be automatic

    2) disconnected, when WS has been disconnected by exchange

    Data will be an object {connectionId,code:integer,reason:string}

    - connectionId : id of WS connection
    - code: disconnection code
    - reason : disconnection reason

    Reconnection will be automatic

    3) terminated, when connection failed after last connection retry

    This is a final event. Client will need to call reconnect

    Data will be an object {connectionId:integer,attempts:integer,error:err}

    - connectionId : id of WS connection
    - attempts : number of attempts to connect
    - error : the connection error which occurred

    4) connected, when websocket connection is connected/reconnected (but not yet ready)

    Data will be an object {connectionId:integer}

    5) ready, when websocket connection is ready to receive/send messages

    Event will only be emitted once in the lifetime of the object, after receiving initial 'hello' message

    Data will be an object {sessionId:string,isNew:boolean}

    Following other events can be emitted

    - ticker : one per exchange/pair combination
    - orderBook : one per exchange/pair combination for full order book
    - orderBookUpdate : one per exchange/pair combination for order book diff with previous full order book
    - trades : one per exchange/pair combination
    - kline : one per exchange/pair/interval combination

    If options.globalListener is true, all exchange related events will be emitted using 'notification' event with following format :

    {
        "notification":string (ticker|orderBook|orderBookUpdate|trades),
        "exchange":string,
        "pair":string,
        "data":object
    }
*/

constructor(uri, options)
{
    super();

    let u = url.parse(uri);
    // the uri we want to connect to
    if (u.protocol != 'ws:' && u.protocol != 'wss:')
    {
        throw new Error("Argument 'uri' should start with 'ws://' or 'wss://'");
    }
    this._uri = `${u.protocol}//${u.host}`;
    if (null !== u.pathname)
    {
        this._uri += u.pathname;
    }
    else
    {
        this._uri += '/';
    }
    this._queryParams = {};

    // sessionId to use
    this._sessionId = null;

    // parse query
    if (null !== u.query)
    {
        let hash = querystring.parse(u.query);
        _.forEach(hash, (value, key) => {
            if ('sid' == key)
            {
                this._sessionId = value;
                return;
            }
            this._queryParams[key] = value;
        });
    }

    // whether or not client wants to have a global listener for all exchange related events
    this._globalListener = false;

    // whether or not socket should be connected automatically
    let autoConnect = true;

    this._retryDelay = RETRY_DELAY;
    this._connectionOptions = {}
    if (undefined !== options)
    {
        if (false === options.autoConnect)
        {
            autoConnect = false;
        }
        if (undefined !== options.globalListener)
        {
            if (true === options.globalListener)
            {
                this._globalListener = true;
            }
        }
        if (undefined !== options.sessionId)
        {
            let sid = options.sessionId.trim();
            if ('' != sid)
            {
                this._sessionId = sid;
            }
        }
        if (undefined !== options.apiKey && '' != options.apiKey)
        {
            this._connectionOptions.apiKey = options.apiKey;
        }
        // retry count
        if (undefined !== options.retryCount)
        {
            if ('always' === options.retryCount)
            {
                this._connectionOptions.retryCount = -1;
            }
            else
            {
                let value = parseInt(options.retryCount);
                if (isNaN(value) || value < 0)
                {
                    throw new Error("Argument 'options.retryCount' should be an integer >= 0");
                }
                this._connectionOptions.retryCount = value;
            }
        }
        if (undefined !== options.retryDelay)
        {
            let value = parseInt(options.retryDelay);
            if (isNaN(value) || value < 1000)
            {
                throw new Error("Argument 'options.retryDelay' should be an integer >= 1000");
            }
            this._connectionOptions.retryDelay = value;
            this._retryDelay = value;
        }
        if (undefined !== options.pingTimeout)
        {
            let value = parseInt(options.pingTimeout);
            if (isNaN(value) || value < 1000)
            {
                throw new Error("Argument 'options.pingTimeout' should be an integer >= 1000");
            }
            this._connectionOptions.pingTimeout = value;
        }
    }

    // keep track of how many connections were performed
    this._connectionCounter = 0;
    this._connection = null;
    // timestamp of last connected event
    this._connectedTimestamp = null;
    // timestamp when 'ready' event was emitted
    this._readyTimestamp = null;

    // id of next command
    this._nextCommandId = 1;
    // mapping commandId => callback
    this._callbacks = {};
    // queue used when trying to send commands while ws is not connected yet
    this._queue = [];

    if (autoConnect)
    {
        this.connect();
    }
}

_getUri()
{
    let uri = this._uri;
    let params = {};
    if (null !== this._sessionId)
    {
        params['sid'] = this._sessionId;
        _.forEach(this._queryParams, (value, key) => {
            switch (key)
            {
                // only send expires & timeout on initial connection
                case 'expires':
                case 'timeout':
                    if (null !== this._readyTimestamp)
                    {
                        break;
                    }
                default:
                    params[key] = value;
            }
        });
    }
    if (!_.isEmpty(params))
    {
        uri = uri + '?' + querystring.stringify(params);
    }
    return uri;
}

getSessionId()
{
    return this._sessionId;
}

/**
 * Reconnect WS
 *
 */
reconnect()
{
    if (null === this._connection)
    {
        return;
    }
    let connection = this._connection;
    connection.disconnect();
    this._createConnection();
}

/*
 * Connect WS
 *
 * Should not be necessary since connection will happen automatically on first call to 'execute' method
 */
connect()
{
    // create if needed
    if (null !== this._connection)
    {
        return;
    }
    this._createConnection();
}

isConnected()
{
    if (null === this._connection)
    {
        return false;
    }
    return this._connection.isConnected()
}

isReady()
{
    return null !== this._readyTimestamp;
}

_checkExchange(exchange)
{
    if ('string' !== typeof exchange || '' == exchange)
    {
        throw new Error("Argument 'exchange' should be a non-empty string");
    }
}

_checkExchangeAndPairs(exchange, pairs)
{
    if ('string' !== typeof exchange || '' == exchange)
    {
        throw new Error("Argument 'exchange' should be a non-empty string");
    }
    if (!Array.isArray(pairs))
    {
        throw new Error("Argument 'pairs' should be an array");
    }
}

/**
 * Retrieves existing pairs
 *
 * @param {string} exchange exchange id
 * @param {object} filter {currency:string,baseCurrency:string}
 * @param {function} cb callback to call (mandatory)
 */
getPairs(exchange, filter, cb)
{
    this._checkExchange(exchange);
    let params = {
        exchange:exchange
    }
    // cb might have been passed as second parameter
    if (undefined === cb)
    {
        if ('function' != typeof(filter))
        {
            throw new Error("Argument 'cb' is mandatory");
        }
        cb = filter;
    }
    else
    {
        if (undefined !== filter)
        {
            if (undefined !== filter.currency && '' !== filter.currency)
            {
                params.filter = {currency:filter.currency};
            }
            else if (undefined !== filter.baseCurrency && '' !== filter.baseCurrency)
            {
                params.filter = {baseCurrency:filter.baseCurrency};
            }
        }
    }
    this.execute('getPairs', params, cb);
}

/**
 * Subscribe to tickers for a list of pairs
 *
 * NB: it is also possible to call method using subscribeToTickers(exchange, pairs, cb)
 *
 * @param {string} exchange exchange identifier
 * @param {array} pairs list of pairs (ex: ["USDT-BTC",...])
 * @param {boolean} reset if true, existing subscriptions will be discarded and replaced by new ones (optional, default = false)
 * @param {function} cb callback to call upon receiving command result (optional)
 */

/*
    Following events will be triggered :

    - one 'ticker' event per pair, with following data

    {
        "exchange":"bittrex",
        "pair":"USDT-ETH",
        "data":{
            "pair":"USDT-ETH",
            "timestamp":1508970583.279,
            "priceChangePercent":-4.43,
            "high":323.81945883,
            "low":304.64171183,
            "last":308.36163935,
            "buy":308.33244613,
            "sell":308.48062765,
            "volume":10061.40862720042
        }
    }
*/
subscribeToTickers(exchange, pairs, reset, cb)
{
    this._checkExchangeAndPairs(exchange, pairs);
    let params = {
        exchange:exchange,
        reset:false,
        pairs:pairs
    }
    if (undefined !== reset)
    {
        if (true === reset || false === reset)
        {
            params.reset = reset;
        }
        // probably a callback
        else if ('function' == typeof reset)
        {
            cb = reset;
        }
    }
    this.execute('subscribeToTickers', params, cb);
}

/**
 * Unsubscribe from tickers for a list of pairs
 *
 * @param {string} exchange exchange identifier
 * @param {array} pairs list of pairs (ex: ["USDT-BTC",...])
 * @param {function} cb callback to call upon receiving command result (optional)
 */
unsubscribeFromTickers(exchange, pairs, cb)
{
    this._checkExchangeAndPairs(exchange, pairs);
    let params = {
        exchange:exchange,
        pairs:pairs
    }
    this.execute('unsubscribeFromTickers', params, cb);
}

/**
 * Unsubscribe from all tickers we are currently subscribed to
 *
 * @param {string} exchange exchange identifier
 * @param {function} cb callback to call upon receiving command result (optional)
 */
unsubscribeFromAllTickers(exchange, cb)
{
    this._checkExchange(exchange);
    let params = {
        exchange:exchange
    }
    this.execute('unsubscribeFromAllTickers', params, cb);
}

/**
 * Subscribe to order books for a list of pairs
 *
 * This will trigger following events :
 *
 * - orderBook : {exchange:string,pair:string,data:object}
 *
 * NB: it is also possible to call method using subscribeToOrderBooks(exchange, pairs, cb)
 *
 * @param {string} exchange exchange identifier
 * @param {array} pairs list of pairs (ex: ["USDT-BTC",...])
 * @param {boolean} reset if true, existing subscriptions will be discarded and replaced by new ones (optional, default = false)
 * @param {function} cb callback to call upon receiving command result (optional)
 */

/*
    Following events will be triggered :

    - one 'orderBook' event per pair, with following data (event will be sent only once after each connection/reconnection or if 'resyncOrderBooks' is called)

    {
        "exchange":"bittrex",
        "pair":"USDT-BTC",
        "data":{
            "cseq":1508933973,
            "buy":[
                {
                    "quantity":0.0725237,
                    "rate":5770.22611328
                },
                {
                    "quantity":0.07289463,
                    "rate":5762.79913753
                },...
            ],
            "sell":[
                {
                    "quantity":0.08658098,
                    "rate":5771.06827704
                },
                {
                    "quantity":0.08536155,
                    "rate":5771.50324368
                },...
            ]
        }
    }

    - one 'orderBookUpdate' per pair (will be sent on each orderbook update)

    {
        "exchange":"bittrex",
        "pair":"USDT-BTC",
        "data":{
            "cseq":1508933974,
            "buy":[
                {
                    "quantity":0.0725237,
                    "rate":5770.25730242,
                    "action":"update"
                },
                {
                    "quantity":0.0725237,
                    "rate":5770.22611328,
                    "action":"remove"
                },...
            ],
            "sell":[
                {
                    "quantity":0.08658098,
                    "rate":5771.04349666,
                    "action":"update"
                },
                {
                    "quantity":0.08658098,
                    "rate":5771.06827704,
                    "action":"remove"
                },...
            ]
        }
    }
*/
subscribeToOrderBooks(exchange, pairs, reset, cb)
{
    this._checkExchangeAndPairs(exchange, pairs);
    let params = {
        exchange:exchange,
        reset:false,
        pairs:pairs
    }
    if (undefined !== reset)
    {
        if (true === reset || false === reset)
        {
            params.reset = reset;
        }
        // probably a callback
        else if ('function' == typeof reset)
        {
            cb = reset;
        }
    }
    this.execute('subscribeToOrderBooks', params, cb);
}

/**
 * Ask for order books resync for a list of pairs (this will trigger new 'orderBook' event)
 *
 * @param {string} exchange exchange identifier
 * @param {array} pairs list of pairs (ex: ["USDT-BTC",...])
 * @param {function} cb callback to call upon receiving command result (optional)
 */

/*
    Following events will be triggered :

    - one orderBook event for each pair (see 'subscribeToOrderBooks' method)
*/
 resyncOrderBooks(exchange, pairs, cb)
 {
     this._checkExchangeAndPairs(exchange, pairs);
     let params = {
         exchange:exchange,
         pairs:pairs
     }
     this.execute('resyncOrderBooks', params, cb);
 }

/**
 * Unsubscribe from order books for a list of pairs
 *
 * @param {string} exchange exchange identifier
 * @param {array} pairs list of pairs (ex: ["USDT-BTC",...])
 * @param {function} cb callback to call upon receiving command result (optional)
 */
unsubscribeFromOrderBooks(exchange, pairs, cb)
{
    this._checkExchangeAndPairs(exchange, pairs);
    let params = {
        exchange:exchange,
        pairs:pairs
    }
    this.execute('unsubscribeFromOrderBooks', params, cb);
}

/**
 * Unsubscribe from all order books we are currently subscribed to
 *
 * @param {string} exchange exchange identifier
 * @param {function} cb callback to call upon receiving command result (optional)
 */
unsubscribeFromAllOrderBooks(exchange, cb)
{
    this._checkExchange(exchange);
    let params = {
        exchange:exchange
    }
    this.execute('unsubscribeFromAllOrderBooks', params, cb);
}

/**
 * Subscribe to trades for a list of pairs
 *
 * NB: it is also possible to call method using subscribeToTrades(exchange, pairs, cb)
 *
 * @param {string} exchange exchange identifier
 * @param {array} pairs list of pairs (ex: ["USDT-BTC",...])
 * @param {boolean} reset if true, existing subscriptions will be discarded and replaced by new ones (optional, default = false)
 * @param {function} cb callback to call upon receiving command result (optional)
 */

/*
    Following events will be triggered :

    - one trades event for each pair

    {
        "exchange":"bittrex",
        "pair":"USDT-BTC",
        "data":[
            {
                "rate":5771,
                "quantity":0.59180118,
                "type":"sell",
                "timestamp":1508956034.149,
                "id":1508940328
            },
            {
                "rate":5771,
                "quantity":0.16332246,
                "type":"buy",
                "timestamp":1508956034.149,
                "id":1508940329
            },...
        ]
    }
*/
subscribeToTrades(exchange, pairs, reset, cb)
{
    this._checkExchangeAndPairs(exchange, pairs);
    let params = {
        exchange:exchange,
        reset:false,
        pairs:pairs
    }
    if (undefined !== reset)
    {
        if (true === reset || false === reset)
        {
            params.reset = reset;
        }
        // probably a callback
        else if ('function' == typeof reset)
        {
            cb = reset;
        }
    }
    this.execute('subscribeToTrades', params, cb);
}

/**
 * Unsubscribe from trades for a list of pairs
 *
 * @param {string} exchange exchange identifier
 * @param {array} pairs list of pairs (ex: ["USDT-BTC",...])
 * @param {function} cb callback to call upon receiving command result (optional)
 */
unsubscribeFromTrades(exchange, pairs, cb)
{
    this._checkExchangeAndPairs(exchange, pairs);
    let params = {
        exchange:exchange,
        pairs:pairs
    }
    this.execute('unsubscribeFromTrades', params, cb);
}

/**
 * Unsubscribe from all trades we are currently subscribed to
 *
 * @param {string} exchange exchange identifier
 * @param {function} cb callback to call upon receiving command result (optional)
 */
unsubscribeFromAllTrades(exchange, cb)
{
    this._checkExchange(exchange);
    let params = {
        exchange:exchange
    }
    this.execute('unsubscribeFromAllTrades', params, cb);
}

/**
 * Subscribe to klines for a list of pairs
 *
 * NB: it is also possible to call method using subscribeToKlines(exchange, pairs, interval, cb)
 *
 * @param {string} exchange exchange identifier
 * @param {array} pairs list of pairs (ex: ["USDT-BTC",...])
 * @param {string} klines interval (ex: 5m)
 * @param {boolean} reset if true, existing subscriptions will be discarded and replaced by new ones (optional, default = false)
 * @param {function} cb callback to call upon receiving command result (optional)
 */
/*
    Following events will be triggered :

    - one 'kline' event per pair/interval, with following data

    {
        "exchange":"binance",
        "pair":"USDT-ETH",
        "interval":"5m",
        "data":{
            "timestamp":1515410100,
            "open":1135.5,
            "close":1131.76,
            "high":1136.3,
            "low":1130.13,
            "volume":74.30783
        }
    }
*/
subscribeToKlines(exchange, pairs, interval, reset, cb)
{
    this._checkExchangeAndPairs(exchange, pairs);
    if ('string' !== typeof interval || '' == interval)
    {
        throw new Error("Argument 'interval' should be a non-empty string");
    }
    let params = {
        exchange:exchange,
        interval:interval,
        reset:false,
        pairs:pairs
    }
    if (undefined !== reset)
    {
        if (true === reset || false === reset)
        {
            params.reset = reset;
        }
        // probably a callback
        else if ('function' == typeof reset)
        {
            cb = reset;
        }
    }
    this.execute('subscribeToKlines', params, cb);
}

/**
 * Unsubscribe from klines for a list of pairs
 *
 * NB: it is also possible to call method using unsubscribeFromKlines(exchange, pairs, cb)
 *
 * @param {string} exchange exchange identifier
 * @param {array} pairs list of pairs (ex: ["USDT-BTC",...])
 * @param {interval} string kline interval (ex: 5m) (optional, if not defined will unsubscribe for all intervals)
 * @param {function} cb callback to call upon receiving command result (optional)
 */
unsubscribeFromKlines(exchange, pairs, interval, cb)
{
    this._checkExchangeAndPairs(exchange, pairs);
    let params = {
        exchange:exchange,
        pairs:pairs
    }
    if (undefined !== interval)
    {
        // probably a callback
        if ('function' == typeof reset)
        {
            cb = interval;
        }
        else
        {
            if ('string' !== typeof interval || '' == interval)
            {
                throw new Error("Argument 'interval' should be a non-empty string");
            }
            params.interval = interval;
        }
    }
    this.execute('unsubscribeFromKlines', params, cb);
}

/**
 * Unsubscribe from all klines we are currently subscribed to
 *
 * @param {string} exchange exchange identifier
 * @param {function} cb callback to call upon receiving command result (optional)
 */
unsubscribeFromAllKlines(exchange, cb)
{
    this._checkExchange(exchange);
    let params = {
        exchange:exchange
    }
    this.execute('unsubscribeFromAllKlines', params, cb);
}
///

/**
 * Unsubscribe globally for a given exchange or all exchanges
 *
 * @param {string} exchange exchange identifier (optional, if not defined subscriptions will be cancelled for all exchanges)
 * @param {function} cb callback to call upon receiving command result (optional)
 */
unsubscribe(exchange, cb)
{
    let params = {};
    if (undefined !== exchange)
    {
        if ('function' != typeof exchange)
        {
            this._checkExchange(exchange);
            params.exchange = exchange;
        }
        else
        {
            cb = exchange;
        }
    }
    this.execute('unsubscribe', params, cb);
}

/*
 * Used to call any methods
 */
execute(command, params, cb)
{
    let message = {
        m:command
    }
    if (undefined !== params)
    {
        message.p = params;
    }
    if (undefined !== cb)
    {
        message.i = this._nextCommandId++;
        this._callbacks[message.i] = cb;
    }
    this._send([message]);
}

/**
 * Send a list of objects over WS
 *
 * @param {object} list list of data to send (each entry will be serialized to JSON and sent individually)
 */
_send(list)
{
    // create if needed
    if (null === this._connection)
    {
        this._queueMessages(list);
        this._createConnection();
        return;
    }
    if (!this._connection.isConnected())
    {
        this._queueMessages(list);
        return;
    }
    // we didn't receive 'hello' message yet
    if (null === this._readyTimestamp)
    {
        this._queueMessages(list);
        return;
    }
    for (var i = 0; i < list.length; ++i)
    {
        if (debug.enabled)
        {
            debug(`Sending message : ${JSON.stringify(list[i])}`);
        }
        this._connection.send(JSON.stringify(list[i]));
    }
}

/**
 * Adds a list of object to the queue
 */
_queueMessages(list)
{
    for (var i = 0; i < list.length; ++i)
    {
        if (debug.enabled)
        {
            debug(`Queuing message : ${JSON.stringify(list[i])}`);
        }
        this._queue.push(list[i]);
    }
}

/**
 * Sends each message from queue
 */
_processQueue()
{
    if (0 == this._queue.length)
    {
        return;
    }
    // disconnection probably requested by client
    if (null === this._connection)
    {
        return;
    }
    for (var i = 0; i < this._queue.length; ++i)
    {
        if (debug.enabled)
        {
            debug(`Sending message from queue : ${JSON.stringify(this._queue[i])}`);
        }
        this._connection.send(JSON.stringify(this._queue[i]));
    }
    this._queue = [];
}

_createConnection(delay)
{
    let self = this;
    let counter = ++this._connectionCounter;
    let connection = new WebSocketConnection(this._getUri(), this._connectionOptions);

    /*
     WS connection has been disconnected by exchange
     */
    connection.on('disconnected', function(data){
        if (debug.enabled)
        {
            debug("Connection #%d disconnected (will try to reconnect in %dms) : code = %d, reason = '%s'", counter, self._retryDelay, data.code, data.reason);
        }
        self.emit('disconnected', {connectionId:counter,code:data.code,reason:data.reason});
        self._createConnection.call(self, self._retryDelay);
    });

    /*
     A connection error occured (connection retry will be automatic if possible)
     */
    connection.on('connectionError', function(err){
        // retry is possible
        if (err.retry)
        {
            if (debug.enabled)
            {
                debug("Connection #%d failed (will try to reconnect in %dms) : attempts = %d, error = '%s'", counter, self._retryDelay, err.attempts, JSON.stringify(err.error));
            }
            self.emit('connectionError', {connectionId:counter,attempts:err.attempts,error:err.error});
            return;
        }
        // no more retry
        if (debug.enabled)
        {
            debug("Connection #%d failed (no more retry left) : attempts = %d, error = '%s'", counter, err.attempts, JSON.stringify(err.error));
        }
        self.emit('terminated', {connectionId:counter,attempts:err.attempts,error:err.error});
    });

    /*
     * WS is ready to receive messages
     */
    connection.on('connected', function(){
        if (debug.enabled)
        {
            debug("Connection #%d connected", counter);
        }
        self._connectedTimestamp = new Date().getTime();
        self.emit('connected', {connectionId:counter});
    });

    connection.on('message', function(message){
        self._processMessage.call(self, message);
    });

    self._connection = connection;
    try
    {
        // connect immediately
        if (undefined === delay)
        {
            connection.connect();
        }
        else
        {
            setTimeout(function(){
                // disconnection probably requested by client
                if (null === self._connection)
                {
                    return;
                }
                connection.connect();
            }, delay);
        }
    }
    catch (e)
    {
        throw e;
    }
}

/*
 * Can be called to disconnect. Client won't reconnect automatically unless methods (connect,execute) are called again
 */
disconnect()
{
    if (null === this._connection)
    {
        return;
    }
    if (debug.enabled)
    {
        debug("Client will be disconnected (%d connections have been made)", this._connectionCounter);
    }
    let connection = this._connection;
    this._connection = null;
    connection.disconnect();
}

/**
 * Where we handle all messages received from exchange
 */
_processMessage(message)
{
    try
    {
        let data = JSON.parse(message);
        // process hello message
        if (undefined !== data.hello)
        {
            if (debug.enabled)
            {
                debug(`Received 'hello' message : sid = '${data.hello.sid}'`);
            }
            this._sessionId = data.hello.sid;
            if (null === this._readyTimestamp || data.hello.isNew)
            {
                this._readyTimestamp = new Date().getTime();
                this.emit('ready', {sessionId:data.hello.sid,isNew:data.hello.isNew});
            }
            this._processQueue();
            return;
        }
        if (debug.enabled)
        {
            let obj = {i:data.i,e:data.e,n:data.n};
            debug(`Received message : ${JSON.stringify(obj)}`);
        }
        if (null === this._readyTimestamp)
        {
            if (debug.enabled)
            {
                let obj = {i:data.i,e:data.e,n:data.n};
                debug(`Ignoring message since we didn't receive 'hello' notification yet : ${JSON.stringify(obj)}`);
            }
            return;
        }
        if (undefined !== data.n)
        {
            this._processNotificationMessage(data);
        }
        else if (undefined !== data.r)
        {
            this._processResultMessage(data);
        }
        else if (undefined !== data.e)
        {
            this._processErrorMessage(data);
        }
        else
        {
            if (debug.enabled)
            {
                debug(`Received unsupported message : ${message}`);
            }
        }
    }
    // ignore non json messages
    catch (e)
    {
        if (debug.enabled)
        {
            debug(`Received invalid JSON message : ${message}`);
        }
        return;
    }
}

_processNotificationMessage(data)
{
    if (!this._globalListener)
    {
        this.emit(data.n, data.d);
        return;
    }
    data.d.notification = data.n;
    this.emit('notification', data.d);
}

_processResultMessage(data)
{
    // unlikely to happen
    if (undefined === this._callbacks[data.i])
    {
        return;
    }
    let cb = this._callbacks[data.i];
    delete this._callbacks[data.i];
    try
    {
        cb(data.r, null);
    }
    catch (e)
    {
        // we're not responsible for this, just retrow the error
        throw e;
    }
}

_processErrorMessage(data)
{
    // unlikely to happen
    if (undefined === this._callbacks[data.i])
    {
        return;
    }
    let cb = this._callbacks[data.i];
    delete this._callbacks[data.i];
    try
    {
        cb(null, data.e);
    }
    catch (e)
    {
        // we're not responsible for this, just retrow the error
        throw e;
    }
}

}

module.exports = Client;
