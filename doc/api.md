# Constructor

Constructor takes a single mandatory _uri_ parameter :

* _uri_ : websocket uri (ex: _ws://127.0.0.1:8001_)

An object with following available properties (all optional) can also be passed as second argument :

* _apiKey_ : string, api key configured on gateway (used to restrict access)

* _autoConnect_ : boolean, if true client will initiate first connection automatically (default = _true_)

* _globalListener_ : if true, a global _notification_ event will be emitted for all trading related events and individual events won't be emitted (default = _false_)

* _retryDelay_ : _integer_, delay in milliseconds before reconnecting upon disconnection or connection failure (default = _10000_)

* _retryCount_ : _integer_, number of retries in case connection fails (can be set to string _always_ to retry indefinitely) (default = _always_)

* _pingTimeout_ : _integer_, how many seconds to wait for a reply to WS PING, before reconnecting (default = 30000)

# Emitted events

## Connection related events

### connected

When connection has been established (connected/reconnection). No action should be taken by client.

```
{
    "connectionId":integer
}
```

* _connectionId_ : id WS connection (will increment for each reconnection)

### disconnected

When connection has been closed unexpectedly. Reconnection will be automatic, no action should be taken by client.

```
{
    "connectionId":integer,
    "code":integer,
    "reason":string
}
```

* _connectionId_ : id of WS connection

* _code_ : disconnection code

* _reason_ : disconnection reason

### connectionError

When a connection/reconnection error has occurred. Library will automatically retry to connect. No action should be taken by client.

```
{
    "connectionId":integer,
    "attempts":integer,
    "error":{
        "code":string,
        "message":string
    }
}
```

* _connectionId_ : id of WS connection

* _attempts_ : numbe of connection attempts with current connection id

* _error_ : connection error information

### terminated

When connection failed after last connection retry. This is a final event, library will not try to reconnect automatically anymore. This event will never be emitted if library was setup with infinite retry (see _constructor_). Client should call method _reconnect()_ upon receiving this event.

```
{
    "step":string,
    "attempts":integer,
    "error":object
}
```

## Trading related event

### ticker

_Example_

```
{
    "exchange":"bittrex",
    "pair":"USDT-BTC",
    "data":{
        "pair":"USDT-BTC",
        "last":7155,
        "priceChangePercent":-5.206677139913463,
        "sell":7155,
        "buy":7150,
        "high":7576,
        "low":7100.01,
        "volume":5357.92210528,
        "timestamp":1509986841.91
    }
}
```

### orderBook

```
{
    "exchange":"bittrex",
    "pair":"USDT-BTC",
    "cseq":54694,
    "data":{
        "buy":[
            {
                "rate":7158,
                "quantity":0.18125832
            },
            {
                "rate":7147.84000102,
                "quantity":0.33576833
            },
            {
                "rate":7147.84000003,
                "quantity":0.00037697
            }
        ],
        "sell":[
            {
                "rate":7159.61768333,
                "quantity":0.75758168
            },
            {
                "rate":7159.62768333,
                "quantity":0.00350054
            },
            {
                "rate":7162.99999999,
                "quantity":0.1648124
            },
            {
                "rate":7167.99999999,
                "quantity":0.59600039
            },
            {
                "rate":7169.99999999,
                "quantity":0.5333059
            }
        ]
    }
}
```

### orderBookUpdate

```
{
    "exchange":"bittrex",
    "pair":"USDT-BTC",
    "cseq":85719,
    "data":{
        "buy":[
            {
                "action":"update",
                "rate":7131,
                "quantity":0.72188827
            }
        ],
        "sell":[
            {
                "action":"remove",
                "rate":7221.71517258,
                "quantity":0
            },
            {
                "action":"update",
                "rate":7226.99999999,
                "quantity":0.61909178
            },
            {
                "action":"update",
                "rate":7265.72525,
                "quantity":0.00709438
            }
        ]
    }
}
```

### trades

```
{
    "exchange":"bittrex",
    "pair":"USDT-BTC",
    "data":[
        {
            "id":23090089,
            "quantity":0.0288771,
            "rate":7149.99999999,
            "price":206.47126499,
            "orderType":"buy",
            "timestamp":1509986924.897
        },
        {
            "id":23090087,
            "quantity":0.00460101,
            "rate":7149.99999999,
            "price":32.89722149,
            "orderType":"buy",
            "timestamp":1509986924.553
        }
    ]
}
```
_NB_ : _id_ property should be considered as optional as it might not be available on all exchanges (ie: don't rely on it)

### klines

_Example_

```
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
```

# Methods

All methods accept a callback as last argument to have access to the reply from exchange :

```
client.getPairs('bittrex', function(result, error){

});
```
* if gateway returned an error, _result_ will be null
* if gateway returned no error, _error_ will be null

## Retrieve all pairs available on an exchange

Method _getPairs(exchange, filter, cb)_

* _exchange_ : exchange identifier

* _filter_ : {currency:string,baseCurrency:string}, used to filter pairs based on currency or base currency (if _currency_ is set, _baseCurrency_ will be ignored) (optional)

* _cb_ : result callback

In case method was called successfully, callback _result_ will be as below :

```
{
    "BTC-ETH":{
        "pair":"BTC-ETH",
        "baseCurrency":"BTC",
        "currency":"ETH"
    },
    "BTC-NEO":{
        "pair":"BTC-NEO",
        "baseCurrency":"BTC",
        "currency":"NEO"
    },
    ...
}
```
## Subscribe to tickers

Used to subscribe to tickers for a list of pairs

Method _subscribeToTickers(exchange, pairs, reset, cb)_

* _exchange_ : exchange identifier

* _pairs_ : array of pairs to subscribed to (ex: _['USDT-BTC']_)

* _reset_ : if _true_, previous subscriptions will be discarded (optional, default = _false_)

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Unsubscribe from tickers

Used to unsubscribe from tickers for a list of pairs

Method _unsubscribeFromTickers(exchange, pairs, cb)_

* _exchange_ : exchange identifier

* _pairs_ : array of pairs to subscribed to (ex: _['USDT-BTC']_)

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Unsubscribe from all tickers

Used to unsubscribe from tickers for all currently subscribed pairs

Method _unsubscribeFromAllTickers(exchange, cb)_

* _exchange_ : exchange identifier

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Subscribe to order books

Used to subscribe to order books for a list of pairs

Method _subscribeToOrderBooks(exchange, pairs, reset, cb)_

* _exchange_ : exchange identifier

* _pairs_ : array of pairs to subscribed to (ex: _['USDT-BTC']_)

* _reset_ : if _true_, previous subscriptions will be discarded (optional, default = _false_)

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Unsubscribe from order books

Used to unsubscribe from order books for a list of pairs

Method _unsubscribeFromOrderBooks(exchange, pairs, cb)_

* _exchange_ : exchange identifier

* _pairs_ : array of pairs to subscribed to (ex: _['USDT-BTC']_)

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Unsubscribe from all order books

Used to unsubscribe from order books for all currently subscribed pairs

Method _unsubscribeFromAllOrderBooks(exchange, cb)_

* _exchange_ : exchange identifier

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Resync order book

Used to request full order book for a list of pairs. This shouldn't be necessary as this is likely to be automatically done by gateway

Method _resyncOrderBooks(exchange, pairs)_

* _exchange_ : exchange identifier

* _pairs_ : array of pairs to ask full order books for (ex: _['USDT-BTC']_)

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Subscribe to trades

Used to subscribe to trades for a list of pairs

Method _subscribeToTrades(exchange, pairs, reset, cb)_

* _exchange_ : exchange identifier

* _pairs_ : array of pairs to subscribed to (ex: _['USDT-BTC']_)

* _reset_ : if _true_, previous subscriptions will be discarded (optional, default = _false_)

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Unsubscribe from trades

Used to unsubscribe from trades for a list of pairs

Method _unsubscribeFromTrades(exchange, pairs, cb)_

* _exchange_ : exchange identifier

* _pairs_ : array of pairs to subscribed to (ex: _['USDT-BTC']_)

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Unsubscribe from all trades

Used to unsubscribe from trades for all currently subscribed pairs

Method _unsubscribeFromAllTrades(exchange, cb)_

* _exchange_ : exchange identifier

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Subscribe to klines

Used to subscribe to klines for a list of pairs

Method _subscribeToKlines(exchange, pairs, interval, reset, cb)_

* _exchange_ : exchange identifier

* _pairs_ : array of pairs to subscribed to (ex: _['USDT-BTC']_)

* _interval_ : klines interval (ex: _5m_)

* _reset_ : if _true_, previous subscriptions will be discarded (optional, default = _false_)

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Unsubscribe from klines

Used to unsubscribe from tickers for a list of pairs

Method _unsubscribeFromKlines(exchange, pairs, interval, cb)_

* _exchange_ : exchange identifier

* _pairs_ : array of pairs to subscribed to (ex: _['USDT-BTC']_)

* _interval_ : klines interval (optional, if not defined will unsubscribe for all intervals)

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Unsubscribe from all klines

Used to unsubscribe from klines for all currently subscribed pairs

Method _unsubscribeFromAllKlines(exchange, cb)_

* _exchange_ : exchange identifier

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_

## Unsubscribe

Used to unsubscribe globally from a single exchange or from all exchanges

Method _unsubscribe(exchange, cb)_

* _exchange_ : exchange identifier (optional, if not defined subscriptions will be cancelled for all exchanges)

* _cb_ : result callback (optional)

In case method was called successfully, callback _result_ will be _true_
