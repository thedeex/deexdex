"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

var _event = _interopRequireDefault(require("./event.js"));

var _asset = _interopRequireDefault(require("./asset.js"));

var _account = _interopRequireDefault(require("./account.js"));

var _fees = _interopRequireDefault(require("./fees.js"));

var _transaction = _interopRequireDefault(require("./transaction"));

var _lzmaDMin = require("lzma/src/lzma-d-min");

var _bignumber = _interopRequireDefault(require("bignumber.js"));

var _deexdexEcc = require("deexdex-ecc");

var _deexdexApi = require("deexdex-api");

const getExpireDate = () => {
  let d = new Date();
  d.setFullYear(d.getFullYear() + 5);
  return d.toISOString().slice(0, -5);
};

class Deex {
  static async connect(node = Deex.node, autoreconnect = Deex.autoreconnect) {
    if (Deex.connectPromise) return Deex.connectPromise;
    await (Deex.connectPromise = Deex.reconnect(node, autoreconnect));

    _event.default.connectedNotify();

    return true;
  }

  static disconnect() {
    Deex.connectPromise = undefined;
    Deex.autoreconnect = false;
    (0, _deexdexApi.disconnect)();
  }

  static async reconnect(node, autoreconnect) {
    Deex.chain = await (0, _deexdexApi.connect)(node, undefined, autoreconnect);
    (0, _deexdexEcc.setAddressPrefix)(Deex.chain.addressPrefix);
    Deex.node = node;
    return Deex.chain;
  }

  static generateKeys(accountName, password, roles, prefix) {
    if (!accountName || !password) {
      throw new Error("Account name or password required");
    }

    if (password.length < 12) {
      throw new Error("Password must have at least 12 characters");
    }

    let privKeys = {};
    let pubKeys = {};
    ([...new Set(roles)] || ["active", "owner", "memo"]).forEach(role => {
      privKeys[role] = _deexdexEcc.PrivateKey.fromSeed(_deexdexEcc.key.normalize_brainKey(`${accountName}${role}${password}`));
      pubKeys[role] = privKeys[role].toPublicKey().toString(prefix);
    });
    return {
      privKeys,
      pubKeys
    };
  }

  static async login(accountName, password, feeSymbol = Deex.chain.coreAsset) {
    let acc = await Deex.accounts[accountName],
        activeKey = _deexdexEcc.PrivateKey.fromSeed(`${accountName}active${password}`),
        genPubKey = activeKey.toPublicKey().toString();

    if (genPubKey != acc.active.key_auths[0][0]) throw new Error("The pair of login and password do not match!");
    let account = new Deex(accountName, activeKey.toWif(), feeSymbol);
    account.setMemoKey((acc.options.memo_key === genPubKey ? activeKey : _deexdexEcc.PrivateKey.fromSeed(`${accountName}memo${password}`)).toWif());
    await account.initPromise;
    return account;
  }

  static async loginFromFile(buffer, password, accountName, feeSymbol = Deex.chain.coreAsset) {
    let backup_buffer = _deexdexEcc.Aes.decrypt_with_checksum(_deexdexEcc.PrivateKey.fromSeed(password), _deexdexEcc.PublicKey.fromBuffer(buffer.slice(0, 33)), null
    /*nonce*/
    , buffer.slice(33));

    let buffer_data = JSON.parse(_lzmaDMin.LZMA.decompress(backup_buffer)),
        wallet = buffer_data.wallet[0],
        password_aes = _deexdexEcc.Aes.fromSeed(password),
        encryption_plainbuffer = password_aes.decryptHexToBuffer(wallet.encryption_key),
        aes_private = _deexdexEcc.Aes.fromSeed(encryption_plainbuffer);

    let acc = await Deex.accounts[accountName];
    let accKey = buffer_data.private_keys.find(key => key.pubkey === acc.active.key_auths[0][0]);
    if (!accKey) throw new Error(`Not found active key for account ${accountName}`);
    let private_key_hex = aes_private.decryptHex(accKey.encrypted_key);

    let activeKey = _deexdexEcc.PrivateKey.fromBuffer(new Buffer(private_key_hex, "hex"));

    let account = new Deex(accountName, activeKey.toWif(), feeSymbol);
    let memoKey;
    if (acc.options.memo_key === acc.active.key_auths[0][0]) memoKey = activeKey;else {
      accKey = buffer_data.private_keys.find(key => key.pubkey === acc.options.memo_key);

      if (!accKey) {
        private_key_hex = aes_private.decryptHex(accKey.encrypted_key);
        memoKey = _deexdexEcc.PrivateKey.fromBuffer(new Buffer(private_key_hex, "hex"));
      }
    }
    memoKey && account.setMemoKey(memoKey.toWif());
    await account.initPromise;
    return account;
  }

  static ticker(baseSymbol, quoteSymbol) {
    return _deexdexApi.database.getTicker(baseSymbol.toUpperCase(), quoteSymbol.toUpperCase());
  }

  static async tradeHistory(quoteSymbol, baseSymbol, startDate, stopDate, bucketSeconds) {
    return _deexdexApi.history.getMarketHistory((await Deex.assets[quoteSymbol]).id, (await Deex.assets[baseSymbol]).id, bucketSeconds, startDate.toISOString().slice(0, -5), stopDate.toISOString().slice(0, -5));
  }

  static async getLimitOrders(quoteSymbol, baseSymbol, limit = 50) {
    return _deexdexApi.database.getLimitOrders((await Deex.assets[quoteSymbol]).id, (await Deex.assets[baseSymbol]).id, limit > 100 ? 100 : limit);
  }

  static async getOrderBook(quoteSymbol, baseSymbol, limit = 50) {
    return _deexdexApi.database.getOrderBook((await Deex.assets[quoteSymbol]).id, (await Deex.assets[baseSymbol]).id, limit > 50 ? 50 : limit);
  }

  constructor(accountName, activeKey, _feeSymbol = Deex.chain.coreAsset) {
    (0, _defineProperty2.default)(this, "setFeeAsset", async feeSymbol => {
      await this.initPromise;
      this.feeAsset = await Deex.assets[feeSymbol];
    });
    (0, _defineProperty2.default)(this, "setMemoKey", memoKey => {
      this.memoKey = _deexdexEcc.PrivateKey.fromWif(memoKey);
    });
    (0, _defineProperty2.default)(this, "broadcast", (tx, keys = [this.activeKey]) => {
      return tx.broadcast(keys);
    });
    (0, _defineProperty2.default)(this, "sendOperation", operation => {
      let tx = this.newTx();
      tx.add(operation);
      return tx.broadcast();
    });
    (0, _defineProperty2.default)(this, "balances", async (...args) => {
      await this.initPromise;
      let assets = await Promise.all(args.map(async asset => (await Deex.assets[asset]).id));
      let balances = await _deexdexApi.database.getAccountBalances(this.account.id, assets);
      return Promise.all(balances.map(balance => Deex.assets.fromParam(balance)));
    });
    (0, _defineProperty2.default)(this, "limitOrderCreateOperation", async (sellSymbol, sellAmount, buySymbol, buyAmount, fill_or_kill = false, expiration = getExpireDate(), extensions = []) => {
      if (buyAmount == 0 || sellAmount == 0) throw new Error("Amount equal 0!");
      await this.initPromise;
      let buyAsset = await Deex.assets[buySymbol],
          sellAsset = await Deex.assets[sellSymbol];
      let params = {
        fee: this.feeAsset.toParam(),
        seller: this.account.id,
        amount_to_sell: sellAsset.toParam(sellAmount),
        min_to_receive: buyAsset.toParam(buyAmount),
        fill_or_kill,
        expiration,
        extensions
      };
      return {
        limit_order_create: params
      };
    });
    (0, _defineProperty2.default)(this, "limitOrderCreate", async (...args) => {
      let tx = await this.sendOperation(await this.limitOrderCreateOperation(...args));
      return (await _deexdexApi.database.getObjects([tx[0].trx.operation_results[0][1]]))[0];
    });
    (0, _defineProperty2.default)(this, "buyOperation", async (buySymbol, baseSymbol, amount, price, fill_or_kill = false, expire = getExpireDate()) => {
      await this.initPromise;
      let buyAsset = await Deex.assets[buySymbol],
          baseAsset = await Deex.assets[baseSymbol],
          buyAmount = Math.floor(amount * 10 ** buyAsset.precision),
          sellAmount = Math.floor((0, _bignumber.default)(amount).times(price * 10 ** baseAsset.precision).toString());
      if (buyAmount == 0 || sellAmount == 0) throw new Error("Amount equal 0!");
      let params = {
        fee: this.feeAsset.toParam(),
        seller: this.account.id,
        amount_to_sell: baseAsset.toParam(sellAmount),
        min_to_receive: buyAsset.toParam(buyAmount),
        expiration: expire,
        fill_or_kill: fill_or_kill,
        extensions: []
      };
      return {
        limit_order_create: params
      };
    });
    (0, _defineProperty2.default)(this, "buy", async (...args) => {
      let tx = await this.sendOperation(await this.buyOperation(...args));
      return (await _deexdexApi.database.getObjects([tx[0].trx.operation_results[0][1]]))[0];
    });
    (0, _defineProperty2.default)(this, "sellOperation", async (sellSymbol, baseSymbol, amount, price, fill_or_kill = false, expire = getExpireDate()) => {
      await this.initPromise;
      let sellAsset = await Deex.assets[sellSymbol],
          baseAsset = await Deex.assets[baseSymbol],
          sellAmount = Math.floor(amount * 10 ** sellAsset.precision),
          buyAmount = Math.floor((0, _bignumber.default)(amount).times(price * 10 ** baseAsset.precision).toString());
      if (buyAmount == 0 || sellAmount == 0) throw new Error("Amount equal 0!");
      let params = {
        fee: this.feeAsset.toParam(),
        seller: this.account.id,
        amount_to_sell: sellAsset.toParam(sellAmount),
        min_to_receive: baseAsset.toParam(buyAmount),
        expiration: expire,
        fill_or_kill: fill_or_kill,
        extensions: []
      };
      return {
        limit_order_create: params
      };
    });
    (0, _defineProperty2.default)(this, "sell", async (...args) => {
      let tx = await this.sendOperation(await this.sellOperation(...args));
      return (await _deexdexApi.database.getObjects([tx[0].trx.operation_results[0][1]]))[0];
    });
    (0, _defineProperty2.default)(this, "orders", async () => {
      await this.initPromise;
      return (await _deexdexApi.database.getFullAccounts([this.account.id], false))[0][1].limit_orders;
    });
    (0, _defineProperty2.default)(this, "getOrder", async id => {
      await this.initPromise;
      return (await _deexdexApi.database.getObjects([id]))[0];
    });
    (0, _defineProperty2.default)(this, "cancelOrderOperation", async id => {
      await this.initPromise;
      let params = {
        fee: this.feeAsset.toParam(),
        fee_paying_account: this.account.id,
        order: id,
        extensions: []
      };
      return {
        limit_order_cancel: params
      };
    });
    (0, _defineProperty2.default)(this, "cancelOrder", async (...args) => {
      return this.sendOperation(await this.cancelOrderOperation(...args));
    });
    (0, _defineProperty2.default)(this, "memo", async (toName, message) => {
      if (!this.memoKey) throw new Error("Not set memoKey!");
      let nonce = Date.now().toString(),
          //TransactionHelper.unique_nonce_uint64(),
      to = (await Deex.accounts[toName]).options.memo_key;
      return {
        from: this.memoKey.toPublicKey().toPublicKeyString(),
        to,
        nonce,
        message: _deexdexEcc.Aes.encrypt_with_checksum(this.memoKey, to, nonce, new Buffer(message, "utf-8"))
      };
    });
    (0, _defineProperty2.default)(this, "memoDecode", memos => {
      if (!this.memoKey) throw new Error("Not set memoKey!");
      return _deexdexEcc.Aes.decrypt_with_checksum(this.memoKey, memos.from, memos.nonce, memos.message).toString("utf-8");
    });
    (0, _defineProperty2.default)(this, "transferOperation", async (toName, assetSymbol, amount, memo) => {
      await this.initPromise;
      let asset = await Deex.assets[assetSymbol],
          intAmount = Math.floor(amount * 10 ** asset.precision);
      if (intAmount == 0) throw new Error("Amount equal 0!");
      let params = {
        fee: this.feeAsset.toParam(),
        from: this.account.id,
        to: (await Deex.accounts[toName]).id,
        amount: asset.toParam(intAmount),
        extensions: []
      };
      if (memo) params.memo = typeof memo == "string" ? await this.memo(toName, memo) : memo;
      return {
        transfer: params
      };
    });
    (0, _defineProperty2.default)(this, "transfer", async (...args) => {
      return this.sendOperation(await this.transferOperation(...args));
    });
    (0, _defineProperty2.default)(this, "assetIssueOperation", async (toName, assetSymbol, amount, memo) => {
      await this.initPromise;
      let asset = await Deex.assets[assetSymbol],
          intAmount = Math.floor(amount * 10 ** asset.precision);
      if (intAmount === 0) throw new Error("Amount equal 0!");
      let params = {
        fee: this.feeAsset.toParam(),
        issuer: this.account.id,
        asset_to_issue: asset.toParam(intAmount),
        issue_to_account: (await Deex.accounts[toName]).id
      };
      if (memo) params.memo = typeof memo === "string" ? await this.memo(toName, memo) : memo;
      return {
        asset_issue: params
      };
    });
    (0, _defineProperty2.default)(this, "assetIssue", async (...args) => {
      return this.sendOperation(await this.assetIssueOperation(...args));
    });
    (0, _defineProperty2.default)(this, "assetReserveOperation", async (assetSymbol, amount) => {
      await this.initPromise;
      let payer = this.account.id;
      let asset = await Deex.assets[assetSymbol],
          intAmount = Math.floor(amount * 10 ** asset.precision);
      if (intAmount === 0) throw new Error("Amount equal 0!");
      let params = {
        fee: this.feeAsset.toParam(),
        amount_to_reserve: asset.toParam(intAmount),
        payer,
        extensions: []
      };
      return {
        asset_reserve: params
      };
    });
    (0, _defineProperty2.default)(this, "assetReserve", async (...args) => {
      return this.sendOperation(await this.assetReserveOperation(...args));
    });
    if (activeKey) this.activeKey = _deexdexEcc.PrivateKey.fromWif(activeKey);

    this.newTx = () => {
      return _transaction.default.newTx([this.activeKey]);
    };

    this.initPromise = Promise.all([Deex.accounts[accountName], Deex.assets[_feeSymbol]]).then(params => {
      [this.account, this.feeAsset] = params;
    });
  }

}

(0, _defineProperty2.default)(Deex, "node", "wss://node2.private.deexnet.com/ws");
(0, _defineProperty2.default)(Deex, "autoreconnect", true);
(0, _defineProperty2.default)(Deex, "logger", console);
(0, _defineProperty2.default)(Deex, "subscribe", _event.default.subscribe);
(0, _defineProperty2.default)(Deex, "db", _deexdexApi.database);
(0, _defineProperty2.default)(Deex, "history", _deexdexApi.history);
(0, _defineProperty2.default)(Deex, "network", _deexdexApi.network);
(0, _defineProperty2.default)(Deex, "crypto", _deexdexApi.crypto);
(0, _defineProperty2.default)(Deex, "block", _deexdexApi.block);
(0, _defineProperty2.default)(Deex, "asset", _deexdexApi.asset);
(0, _defineProperty2.default)(Deex, "orders", _deexdexApi.orders);
(0, _defineProperty2.default)(Deex, "call", _deexdexApi.call);
(0, _defineProperty2.default)(Deex, "newTx", _transaction.default.newTx);
(0, _defineProperty2.default)(Deex, "assets", _asset.default);
(0, _defineProperty2.default)(Deex, "accounts", _account.default);
(0, _defineProperty2.default)(Deex, "fees", _fees.default);

_event.default.init(Deex.connect);

var _default = Deex;
exports.default = _default;