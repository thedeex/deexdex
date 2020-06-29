import Event from "./event.js";
import Asset from "./asset.js";
import Account from "./account.js";
import Fees from "./fees.js";
import Transaction from "./transaction";
import { LZMA as lzma } from "lzma/src/lzma-d-min";
import BigNumber from "bignumber.js";
import { PrivateKey, PublicKey, Aes, key } from "deexdex-ecc";
import { setAddressPrefix } from "deexdex-ecc";
import {
  connect,
  disconnect,
  database,
  history,
  network,
  crypto,
  block,
  asset,
  orders,
  call
} from "deexdex-api";

const getExpireDate = () => {
  let d = new Date();
  d.setFullYear(d.getFullYear() + 5);

  return d.toISOString().slice(0, -5);
};

class Deex {
  static node = "wss://node2.private.deexnet.com/ws";
  static autoreconnect = true;
  static logger = console;

  static subscribe = Event.subscribe;

  static db = database;
  static history = history;
  static network = network;
  static crypto = crypto;
  static block = block;
  static asset = asset;
  static orders = orders;
  static call = call;

  static newTx = Transaction.newTx;

  static assets = Asset;
  static accounts = Account;
  static fees = Fees;

  static async connect(
    node = Deex.node,
    autoreconnect = Deex.autoreconnect
  ) {
    if (Deex.connectPromise) return Deex.connectPromise;

    await (Deex.connectPromise = Deex.reconnect(node, autoreconnect));

    Event.connectedNotify();

    return true;
  }

  static disconnect() {
    Deex.connectPromise = undefined;
    Deex.autoreconnect = false;
    disconnect();
  }

  static async reconnect(node, autoreconnect) {
    Deex.chain = await connect(
      node,
      undefined,
      autoreconnect
    );
    setAddressPrefix(Deex.chain.addressPrefix);
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
      privKeys[role] = PrivateKey.fromSeed(
        key.normalize_brainKey(`${accountName}${role}${password}`)
      );
      pubKeys[role] = privKeys[role].toPublicKey().toString(prefix);
    });

    return { privKeys, pubKeys };
  }

  static async login(
    accountName,
    password,
    feeSymbol = Deex.chain.coreAsset
  ) {
    let acc = await Deex.accounts[accountName],
      activeKey = PrivateKey.fromSeed(`${accountName}active${password}`),
      genPubKey = activeKey.toPublicKey().toString();

    if (genPubKey != acc.active.key_auths[0][0])
      throw new Error("The pair of login and password do not match!");

    let account = new Deex(accountName, activeKey.toWif(), feeSymbol);

    account.setMemoKey(
      (acc.options.memo_key === genPubKey
        ? activeKey
        : PrivateKey.fromSeed(`${accountName}memo${password}`)
      ).toWif()
    );

    await account.initPromise;
    return account;
  }

  static async loginFromFile(
    buffer,
    password,
    accountName,
    feeSymbol = Deex.chain.coreAsset
  ) {
    let backup_buffer = Aes.decrypt_with_checksum(
      PrivateKey.fromSeed(password),
      PublicKey.fromBuffer(buffer.slice(0, 33)),
      null /*nonce*/,
      buffer.slice(33)
    );

    let buffer_data = JSON.parse(lzma.decompress(backup_buffer)),
      wallet = buffer_data.wallet[0],
      password_aes = Aes.fromSeed(password),
      encryption_plainbuffer = password_aes.decryptHexToBuffer(
        wallet.encryption_key
      ),
      aes_private = Aes.fromSeed(encryption_plainbuffer);

    let acc = await Deex.accounts[accountName];
    let accKey = buffer_data.private_keys.find(
      key => key.pubkey === acc.active.key_auths[0][0]
    );

    if (!accKey)
      throw new Error(`Not found active key for account ${accountName}`);

    let private_key_hex = aes_private.decryptHex(accKey.encrypted_key);
    let activeKey = PrivateKey.fromBuffer(new Buffer(private_key_hex, "hex"));

    let account = new Deex(accountName, activeKey.toWif(), feeSymbol);

    let memoKey;
    if (acc.options.memo_key === acc.active.key_auths[0][0])
      memoKey = activeKey;
    else {
      accKey = buffer_data.private_keys.find(
        key => key.pubkey === acc.options.memo_key
      );

      if (!accKey) {
        private_key_hex = aes_private.decryptHex(accKey.encrypted_key);
        memoKey = PrivateKey.fromBuffer(new Buffer(private_key_hex, "hex"));
      }
    }

    memoKey && account.setMemoKey(memoKey.toWif());

    await account.initPromise;
    return account;
  }

  static ticker(baseSymbol, quoteSymbol) {
    return database.getTicker(
      baseSymbol.toUpperCase(),
      quoteSymbol.toUpperCase()
    );
  }

  static async tradeHistory(
    quoteSymbol,
    baseSymbol,
    startDate,
    stopDate,
    bucketSeconds
  ) {
    return history.getMarketHistory(
      (await Deex.assets[quoteSymbol]).id,
      (await Deex.assets[baseSymbol]).id,
      bucketSeconds,
      startDate.toISOString().slice(0, -5),
      stopDate.toISOString().slice(0, -5)
    );
  }

  static async getLimitOrders(quoteSymbol, baseSymbol, limit = 50) {
    return database.getLimitOrders(
      (await Deex.assets[quoteSymbol]).id,
      (await Deex.assets[baseSymbol]).id,
      limit > 100 ? 100 : limit
    );
  }

  static async getOrderBook(quoteSymbol, baseSymbol, limit = 50) {
    return database.getOrderBook(
      (await Deex.assets[quoteSymbol]).id,
      (await Deex.assets[baseSymbol]).id,
      limit > 50 ? 50 : limit
    );
  }

  constructor(accountName, activeKey, feeSymbol = Deex.chain.coreAsset) {
    if (activeKey) this.activeKey = PrivateKey.fromWif(activeKey);

    this.newTx = () => {
      return Transaction.newTx([this.activeKey]);
    };

    this.initPromise = Promise.all([
      Deex.accounts[accountName],
      Deex.assets[feeSymbol]
    ]).then(params => {
      [this.account, this.feeAsset] = params;
    });
  }

  setFeeAsset = async feeSymbol => {
    await this.initPromise;
    this.feeAsset = await Deex.assets[feeSymbol];
  };

  setMemoKey = memoKey => {
    this.memoKey = PrivateKey.fromWif(memoKey);
  };

  broadcast = (tx, keys = [this.activeKey]) => {
    return tx.broadcast(keys);
  };

  sendOperation = operation => {
    let tx = this.newTx();
    tx.add(operation);
    return tx.broadcast();
  };

  balances = async (...args) => {
    await this.initPromise;

    let assets = await Promise.all(
      args.map(async asset => (await Deex.assets[asset]).id)
    );
    let balances = await database.getAccountBalances(this.account.id, assets);
    return Promise.all(
      balances.map(balance => Deex.assets.fromParam(balance))
    );
  };

  limitOrderCreateOperation = async (
    sellSymbol,
    sellAmount,
    buySymbol,
    buyAmount,
    fill_or_kill = false,
    expiration = getExpireDate(),
    extensions = []
  ) => {
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

    return { limit_order_create: params };
  };

  limitOrderCreate = async (...args) => {
    let tx = await this.sendOperation(
      await this.limitOrderCreateOperation(...args)
    );
    return (await database.getObjects([tx[0].trx.operation_results[0][1]]))[0];
  };

  buyOperation = async (
    buySymbol,
    baseSymbol,
    amount,
    price,
    fill_or_kill = false,
    expire = getExpireDate()
  ) => {
    await this.initPromise;

    let buyAsset = await Deex.assets[buySymbol],
      baseAsset = await Deex.assets[baseSymbol],
      buyAmount = Math.floor(amount * 10 ** buyAsset.precision),
      sellAmount = Math.floor(
        BigNumber(amount)
          .times(price * 10 ** baseAsset.precision)
          .toString()
      );

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

    return { limit_order_create: params };
  };

  buy = async (...args) => {
    let tx = await this.sendOperation(await this.buyOperation(...args));
    return (await database.getObjects([tx[0].trx.operation_results[0][1]]))[0];
  };

  sellOperation = async (
    sellSymbol,
    baseSymbol,
    amount,
    price,
    fill_or_kill = false,
    expire = getExpireDate()
  ) => {
    await this.initPromise;

    let sellAsset = await Deex.assets[sellSymbol],
      baseAsset = await Deex.assets[baseSymbol],
      sellAmount = Math.floor(amount * 10 ** sellAsset.precision),
      buyAmount = Math.floor(
        BigNumber(amount)
          .times(price * 10 ** baseAsset.precision)
          .toString()
      );

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

    return { limit_order_create: params };
  };

  sell = async (...args) => {
    let tx = await this.sendOperation(await this.sellOperation(...args));
    return (await database.getObjects([tx[0].trx.operation_results[0][1]]))[0];
  };

  orders = async () => {
    await this.initPromise;
    return (await database.getFullAccounts([this.account.id], false))[0][1]
      .limit_orders;
  };

  getOrder = async id => {
    await this.initPromise;
    return (await database.getObjects([id]))[0];
  };

  cancelOrderOperation = async id => {
    await this.initPromise;

    let params = {
      fee: this.feeAsset.toParam(),
      fee_paying_account: this.account.id,
      order: id,
      extensions: []
    };

    return { limit_order_cancel: params };
  };

  cancelOrder = async (...args) => {
    return this.sendOperation(await this.cancelOrderOperation(...args));
  };

  memo = async (toName, message) => {
    if (!this.memoKey) throw new Error("Not set memoKey!");

    let nonce = Date.now().toString(), //TransactionHelper.unique_nonce_uint64(),
      to = (await Deex.accounts[toName]).options.memo_key;

    return {
      from: this.memoKey.toPublicKey().toPublicKeyString(),
      to,
      nonce,
      message: Aes.encrypt_with_checksum(
        this.memoKey,
        to,
        nonce,
        new Buffer(message, "utf-8")
      )
    };
  };

  memoDecode = memos => {
    if (!this.memoKey) throw new Error("Not set memoKey!");

    return Aes.decrypt_with_checksum(
      this.memoKey,
      memos.from,
      memos.nonce,
      memos.message
    ).toString("utf-8");
  };

  transferOperation = async (toName, assetSymbol, amount, memo) => {
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

    if (memo)
      params.memo =
        typeof memo == "string" ? await this.memo(toName, memo) : memo;

    return { transfer: params };
  };

  transfer = async (...args) => {
    return this.sendOperation(await this.transferOperation(...args));
  };

  assetIssueOperation = async (toName, assetSymbol, amount, memo) => {
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

    if (memo)
      params.memo =
        typeof memo === "string" ? await this.memo(toName, memo) : memo;

    return { asset_issue: params };
  };

  assetIssue = async (...args) => {
    return this.sendOperation(await this.assetIssueOperation(...args));
  };

  assetReserveOperation = async (assetSymbol, amount) => {
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

    return { asset_reserve: params };
  };

  assetReserve = async (...args) => {
    return this.sendOperation(await this.assetReserveOperation(...args));
  };
}

Event.init(Deex.connect);

export default Deex;
