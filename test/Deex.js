const assert = require("assert"),
  fs = require("fs"),
  Deex = require("../lib");

require("dotenv").config();

describe("Deex class", function() {
  describe("main test", function() {
    it.only("subscribe", async function() {
      this.timeout(10000);
      await Deex.connect(process.env.DEEX_NODE);

      return new Promise(resolve => {
        Deex.subscribe("block", (...args) => {
          console.log(args);
          resolve();
        });
      });
    });
  });

  describe("#connect()", () => {
    it("connect", async () => {
      let { connect, disconnect } = Deex;
      assert.equal(
        await connect(process.env.DEEX_NODE),
        true,
        "Return not 'true'"
      );

      await disconnect();

      try {
        await Deex.db.get_objects(["1.3.0"]);
      } catch (error) {
        return true;
      }
      throw Error("Disconnect don't work");
    });

    it.skip("subscribe", async () => {
      Deex.subscribe("connected", console.log);
    });
  });

  describe("#login()", () => {
    before(async () => {
      await Deex.connect(process.env.DEEX_NODE);
    });

    after(Deex.disconnect);

    it("login", async () => {
      let { login } = Deex;
      let acc = await login(
        process.env.DEEX_ACCOUNT,
        process.env.DEEX_PASSWORD
      );
      assert.equal(acc.constructor.name, "Deex", "Don't return account");
    });

    it("loginFromFile", async () => {
      let { loginFromFile } = Deex;
      let buffer = fs.readFileSync(process.env.DEEX_WALLET_FILE);

      let acc = await loginFromFile(
        buffer,
        process.env.DEEX_WALLET_PASS,
        process.env.DEEX_ACCOUNT
      );

      assert.equal(acc.constructor.name, "Deex", "Don't return account");
    });
  });

  describe.skip("#subscribe", () => {
    it("connected", async () => {
      await Deex.subscribe("connected", console.log);
    });

    it("block", async () => {
      await Deex.subscribe("block", console.log);
    });

    it("account", async () => {
      Deex.node = process.env.DEEX_NODE;
      await Deex.subscribe("account", console.log, "trade-bot");
    });
  });

  describe.skip("#assetIssue()", () => {
    before(async () => {
      await Deex.connect(process.env.DEEX_NODE);
    });

    after(Deex.disconnect);

    it("issue asset", async () => {
      let bot = await Deex.login(
        process.env.DEEX_ACCOUNT,
        process.env.DEEX_PASSWORD
      );
      let asset = (await bot.balances(process.env.ISSUE_ASSET))[0];
      let balanceBefore = asset.amount / 10 ** asset.asset.precision;

      await bot.assetIssue(
        process.env.DEEX_ACCOUNT,
        process.env.DEEX_ISSUE_ASSET,
        10,
        "Hello"
      );

      let balanceAfter =
        (await bot.balances(process.env.DEEX_ISSUE_ASSET))[0].amount /
        10 ** asset.asset.precision;
      assert.equal(balanceBefore + 10, balanceAfter, "Asset don't issued");
    });

    it("generateKeys", async () => {
      console.log(
        Deex.generateKeys(
          process.env.DEEX_ACCOUNT,
          process.env.DEEX_PASSWORD
        )
      );
    });
  });
});
