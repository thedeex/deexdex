# Index
* [Static methods](https://github.com/scientistnik/deexdex/wiki/class-Deex#static-methods)
  * init()
  * connect()
  * subscribe()
  * generateKeys()
  * ticker()
  * tradeHistory()
* [Object methods](https://github.com/scientistnik/deexdex/wiki/class-Deex#object-methods)
  * constructor()
  * setFeeAsset()
  * setMemoKey()
  * balances()
  * buy()
  * sell()
  * transfer()
  * cancelOrder()
  * orders()

## Static methods
 
### connect()
Signature:
```js
static async connect(node, autoreconnect)
```
#### Example
```js
const Deex = require('deexdex');

start()
async function start() {
  await Deex.connect();

  // Do something...
}
```
### subscribe()
Signature:
```js
static subscribe(event, callback)
```
Now have events:
* `connected` - works once after connecting to the blockchain;
* `block` - it works when a new block is created in the blockchain;
* `account` - occurs when the specified account is changed (balance change).

#### Example
```js
const Deex = require("deexdex");

Deex.init("wss://node2.private.deexnet.com/ws");

Deex.subscribe('connected', startAfterConnected);
Deex.subscribe('block', callEachBlock);
Deex.subscribe('account', changeAccount, 'trade-bot');

async function startAfterConnected() {/* is called once after connecting to the blockchain */}
async function callEachBlock(obj) {/* is called with each block created */}
async function changeAccount(array) {/* is called when you change the 'trade-bot' account */}
```
### generateKeys()
Signature:
```js
static generateKeys(name, password, arrKeysName)
``` 
This method need if you know only login and password. And you need active and memo private keys. This method will be change!

#### Example
```js
const Deex = require("deexdex");

keys = Deex.generateKeys('trade-bot', 'password', ['owner','active','memo']);
console.log(keys); //{ privKeys:{ owner:..., active:..., memo:...}, pubKeys:{ owner:..., active:..., memo:...}}

let acc = new Deex('trade-bot', keys.privKeys.active.toWif());
```

### ticker()
Signature:
```js
static async ticker(baseSymbol, quoteSymbol)
```
#### Example
```js
const Deex = require('deexdex');

start()
async function start() {
  Deex.init();
  await Deex.connect();

  let ticker = await Deex.ticker('usd', 'deex');
  console.log(ticker); // { latest: '0.3857908',lowest_ask: ... }
}
```
### tradeHistory()
Signature:
```js
static async tradeHistory(quoteSymbol, baseSymbol, startDate, stopDate, bucketSeconds)
```
#### Example
```js
const Deex = require('deexdex');

start()
async function start() {
  Deex.init();
  await Deex.connect();

  let start = new Date();
  start.setMonth(start.getMonth() - 1); // Month back
  let stop = new Date();

  let data = await Deex.tradeHistory("usd","deex", start, stop, 60 * 60 * 24)); 
  console.log(data); // [{high_base:..., low_quote:...}, {...}]
}
```
## Object methods
### constructor()
Signature:
```js
constructor(accountName, activeKey, feeSymbol = 'deex')
```
### setFeeAsset()
Signature:
```js
async setFeeAsset(feeSymbol)
```
### setMemoKey()
Signature:
```js
setMemoKey(memoKey)
```
### balances()
Signature:
```js
async balances()
```
#### Example
```js
const Deex = require('deexdex');

Deex.subscribe('connected', start);

async function start() {
  let bot = new Deex('trade-bot', 'privateActiveKey');
  console.log(await bot.balances()); // [{ amount: 117669, asset: Asset {id: '1.3.0',...} },{...}]
}
```
### buy()
Signature:
```js
async buy(buySymbol, baseSymbol, amount, price, fill_or_kill = false, expire = "2020-02-02T02:02:02")
```
#### Example
```js
const Deex = require('deexdex');

Deex.subscribe('connected', start);

async function start() {
  let bot = new Deex('trade-bot', 'privateActiveKey');
  await bot.buy('open.btc', 'deex', 0.0043, 31000);
}
```
### sell()
Signature:
```js
async sell(sellSymbol, baseSymbol, amount, price, fill_or_kill = false, expire = "2020-02-02T02:02:02")
```
#### Example
```js
const Deex = require('deexdex');

Deex.subscribe('connected', start);

async function start() {
  let bot = new Deex('trade-bot', 'privateActiveKey');
  await bot.sell('open.btc', 'deex', 0.0043, 31000);
}
```
### transfer()
Signature:
```js
async transfer(toName, assetSymbol, amount, memo)
```
#### Example
```js
const Deex = require("deexdex");

start()
async function start() {
  await Deex.connect();

  let bot = new Deex("name-account", "yourPrivateActiveKey");

  await bot.transfer("scientistnik","DEEX", 10);
}
```
### cancelOrder()
Signature:
```js
async cancelOrder(id)
```
### orders()
Signature:
```js
async orders()
```
#### Example
```js
const Deex = require('deexdex');

Deex.subscribe('connected', start);

async function start() {
  let bot = new Deex('trade-bot', 'privateActiveKey');
  console.log(await bot.orders()); // [{ id: '1.7.49552602', seller: ..., ... },{...}]
}
```