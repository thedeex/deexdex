__Deex.assets__ use for get asset object.

If you know name asset, `Deex.assets` behave like map:
```js
let usd = await Deex.assets.usd;
let btc = await Deex.assets["DEEX"];
let deex = await Deex.assets["deex"];
```
See current assets in map:
```js
console.log(Deex.assets.map); // {}
let deex = await Deex.assets.deex;
console.log(Deex.assets.map); // { DEEX: Asset {...} }
```
If you want get by id:
```js
let deex = await Deex.assets.id("1.3.0");
```
Each Asset have `update()` method to update asset data:
```js
await deex.update();
```
For update all asset in current map:
```js
await Deex.assets.update();
```
If you want get asset have reserve name ('id' or 'update'):
```js
let asset = Deex.assets.getAsset('update');
```
If you want to know market fee this asset:
```js
let usd = await Deex.assets.usd;
console.log(usd.fee()); // 0.001
```