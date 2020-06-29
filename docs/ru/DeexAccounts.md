__Deex.accounts__ use for get account object.

If you know account name, `Deex.assets` behave like map:
```js
let iam = await Deex.accounts.scientistnik;
let tradebot = await Deex.accounts["trade-bot"];
```

See current accounts in map:
```js
console.log(Deex.accounts.map); // {}
let deex = await Deex.accounts.scientistnik;
console.log(Deex.accounts.map); // { scientistnik: Account {...} }
```
If you want get by id:
```js
let scientistnik = await Deex.accounts.id("1.2.440272");
```
Each Account have `update()` method to update account data:
```js
await scientistnik.update();
```
For update all account in current map:
```js
await Deex.accounts.update();
```
If you want get account have reserve name ('id' or 'update'):
```js
let acc = Deex.accounts.getAccount('update');
```