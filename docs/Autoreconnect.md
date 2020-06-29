```js
const Deex = require("deexdex"),
      {Apis} = require("deexjs-ws");

Apis.setRpcConnectionStatusCallback(statusCallBack)

function statusCallBack(status) {
  if (status === 'closed') {
    console.log("Status connection: closed")
    let reconnectTimer = setInterval(async () => {
      try {
        await Deex.reconnect()
        clearInterval(reconnectTimer)
      } catch(error) {
        console.log(error)
      }
    }, 1000)
  }
}
```