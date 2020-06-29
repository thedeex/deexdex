To access the [Database API](http://docs.deex.org/api/database.html), you can use the __Deex.db__ object.
## get_objects()
Signature:
```js
get_objects(const vector<object_id_type> &ids)
```
### Example:
```js
const Deex = require("deexdex");
Deex.init(config.node);
Deex.subscribe('connected', start);

async function start() {
  let [deex, account, order] = await Deex.db.get_objects(['1.3.0','1.2.849826','1.7.65283036']);

  console.log(deex, account, order);
}
```
