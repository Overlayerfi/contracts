import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { AUSDT_ADDRESS, LZ_ENDPOINT_ETH_MAINNET_V2 } from "../scripts/addresses";
import OVERLAYER_WRAP_ABI from "../artifacts/contracts/overlayer/OverlayerWrap.sol/OverlayerWrap.json";

describe("StakedOverlayerWrapFront", function () {
  async function deployFixture() {
    const [admin, alice, bob] = await ethers.getSigners();

    const block = await admin.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(10)
    };

    const Usdt = await ethers.getContractFactory("FixedSupplyERC20");
    const usdt = await Usdt.deploy(
      1000,
      "USDT",
      "USDT",
      defaultTransactionOptions
    );
    const AUsdt = await ethers.getContractFactory("FixedSupplyERC20");
    const ausdt = await AUsdt.deploy(
      1000,
      "aUSDT",
      "aUSDT",
      defaultTransactionOptions
    );

    const OverlayerWrap = await ethers.getContractFactory("OverlayerWrap");
    const overlayerWrap = await OverlayerWrap.deploy(
      {
        admin: await admin.getAddress(),
        lzEndpoint: LZ_ENDPOINT_ETH_MAINNET_V2,
        name: "O",
        symbol: "O+",
        collateral: {
          addr: await usdt.getAddress(),
          decimals: await usdt.decimals()
        },
        aCollateral: {
          addr: await ausdt.getAddress(),
          decimals: await ausdt.decimals()
        },
        maxMintPerBlock: ethers.MaxUint256,
        maxRedeemPerBlock: ethers.MaxUint256
      },
      defaultTransactionOptions
    );
    await overlayerWrap.waitForDeployment();

    //send some usdt to users
    await usdt
      .connect(admin)
      .transfer(alice.address, ethers.parseUnits("50", await usdt.decimals()));
    await usdt
      .connect(admin)
      .transfer(bob.address, ethers.parseUnits("50", await usdt.decimals()));

    await usdt
      .connect(alice)
      .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);
    await usdt
      .connect(bob)
      .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);
    await usdt
      .connect(admin)
      .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);

    // users mint overlayerWrap
    let mintOrder = {
      benefactor: alice.address,
      beneficiary: alice.address,
      collateral: await usdt.getAddress(),
      collateralAmount: ethers.parseUnits("50", await usdt.decimals()),
      overlayerWrapAmount: ethers.parseEther("50")
    };
    await overlayerWrap.connect(alice).mint(mintOrder);
    mintOrder.benefactor = bob.address;
    mintOrder.beneficiary = bob.address;
    await overlayerWrap.connect(bob).mint(mintOrder);
    mintOrder.benefactor = admin.address;
    mintOrder.beneficiary = admin.address;
    mintOrder.collateralAmount = ethers.parseUnits(
      "100",
      await usdt.decimals()
    );
    mintOrder.overlayerWrapAmount = ethers.parseEther("100");
    await overlayerWrap.connect(admin).mint(mintOrder);

    const StakedOverlayerWrap = await ethers.getContractFactory(
      "StakedOverlayerWrapFront"
    );
    const stakedoverlayerWrap = await StakedOverlayerWrap.deploy(
      await overlayerWrap.getAddress(),
      admin.address,
      admin.address,
      0
    );

    await stakedoverlayerWrap.connect(admin).setCooldownDuration(172800); // 2 days

    const order = {
      benefactor: admin.address,
      beneficiary: admin.address,
      collateral: await usdt.getAddress(),
      collateralAmount: ethers.parseUnits("1", await usdt.decimals()),
      overlayerWrapAmount: ethers.parseEther("1")
    };
    await usdt
      .connect(admin)
      .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);
    await overlayerWrap.connect(admin).mint(order);
    await overlayerWrap
      .connect(admin)
      .approve(await stakedoverlayerWrap.getAddress(), ethers.MaxUint256);

    //stake initial amount to avoid donation attack on staking contract
    await stakedoverlayerWrap
      .connect(admin)
      .deposit(ethers.parseEther("1"), admin.address);

    await overlayerWrap
      .connect(alice)
      .approve(await stakedoverlayerWrap.getAddress(), ethers.MaxUint256);
    await overlayerWrap
      .connect(bob)
      .approve(await stakedoverlayerWrap.getAddress(), ethers.MaxUint256);
    await overlayerWrap
      .connect(admin)
      .approve(await stakedoverlayerWrap.getAddress(), ethers.MaxUint256);

    return { stakedoverlayerWrap, usdt, overlayerWrap, admin, alice, bob };
  }

  describe("Deployment", function () {
    it("Should set the admin role", async function () {
      const { stakedoverlayerWrap, admin } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      expect(await stakedoverlayerWrap.owner()).to.equal(adminAddress);
    });

    it("Should set the rewarder role", async function () {
      const { stakedoverlayerWrap, admin } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      expect(
        await stakedoverlayerWrap.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("REWARDER_ROLE")),
          adminAddress
        )
      ).to.equal(true);
    });

    it("Should not have vesting time", async function () {
      const { stakedoverlayerWrap } = await loadFixture(deployFixture);
      expect(await stakedoverlayerWrap.vestingAmount()).to.equal(0);
    });
  });

  describe("Cooldown check", function () {
    it("Should disable ERC4626 withdraw", async function () {
      const { stakedoverlayerWrap, alice } = await loadFixture(deployFixture);
      await expect(
        stakedoverlayerWrap
          .connect(alice)
          .withdraw(0, alice.address, alice.address)
      ).to.be.eventually.rejected;
    });

    it("Should disable ERC4626 redeem", async function () {
      const { stakedoverlayerWrap, alice } = await loadFixture(deployFixture);
      await expect(
        stakedoverlayerWrap
          .connect(alice)
          .redeem(0, alice.address, alice.address)
      ).to.be.eventually.rejected;
    });
  });

  describe("Blacklist", function () {
    it("Should set blacklist time", async function () {
      const { stakedoverlayerWrap, admin } = await loadFixture(deployFixture);
      await stakedoverlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        admin.address
      );
      const t = await time.latest();
      await stakedoverlayerWrap.connect(admin).setBlackListTime(t + 100);
      expect(await stakedoverlayerWrap.blacklistActivationTime()).to.be.equal(
        t + 100
      );
    });

    it("Should not set time < block.timestamp", async function () {
      const { stakedoverlayerWrap, admin } = await loadFixture(deployFixture);
      await stakedoverlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        admin.address
      );
      const t = await time.latest();
      await expect(stakedoverlayerWrap.connect(admin).setBlackListTime(t - 100))
        .to.be.eventually.rejected;
    });
  });

  describe("Stake", function () {
    it("Should deposit", async function () {
      const { stakedoverlayerWrap, admin, alice, bob } = await loadFixture(
        deployFixture
      );
      expect(await stakedoverlayerWrap.totalAssets()).to.equal(
        ethers.parseEther("1")
      );
      expect(await stakedoverlayerWrap.totalSupply()).to.equal(
        ethers.parseEther("1")
      );
      await expect(
        await stakedoverlayerWrap
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.emit(stakedoverlayerWrap, "Deposit");
      await expect(
        await stakedoverlayerWrap
          .connect(bob)
          .deposit(ethers.parseEther("5"), bob.address)
      ).to.emit(stakedoverlayerWrap, "Deposit");
      expect(await stakedoverlayerWrap.totalAssets()).to.equal(
        ethers.parseEther("16")
      );
      expect(await stakedoverlayerWrap.totalSupply()).to.equal(
        ethers.parseEther("16")
      );
      expect(await stakedoverlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther("10")
      );
      expect(await stakedoverlayerWrap.balanceOf(bob.address)).to.equal(
        ethers.parseEther("5")
      );
      expect(await stakedoverlayerWrap.balanceOf(admin.address)).to.equal(
        ethers.parseEther("1")
      );

      expect(
        await stakedoverlayerWrap.previewRedeem(ethers.parseEther("1"))
      ).to.equal(ethers.parseEther("1"));
    });

    it("Should not not blacklist if not active", async function () {
      const { stakedoverlayerWrap, admin, alice } = await loadFixture(
        deployFixture
      );
      await stakedoverlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        admin.address
      );
      await stakedoverlayerWrap.connect(admin).setBlackListTime(0);
      await time.increase(60 * 60 * 24 * 15 + 1);
      await expect(
        stakedoverlayerWrap.connect(admin).addToBlacklist(alice.address, true)
      ).to.be.eventually.rejected;
    });

    it("Should not deposit if full blacklisted", async function () {
      const { stakedoverlayerWrap, admin, alice } = await loadFixture(
        deployFixture
      );
      await stakedoverlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        admin.address
      );
      const t = await time.latest();
      await stakedoverlayerWrap.connect(admin).setBlackListTime(t + 1);
      await time.increase(60 * 60 * 24 * 15 + 1);
      await stakedoverlayerWrap
        .connect(admin)
        .addToBlacklist(alice.address, true);
      await expect(
        stakedoverlayerWrap
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.be.eventually.rejected;
    });

    it("Should not deposit if soft blacklisted", async function () {
      const { stakedoverlayerWrap, admin, alice } = await loadFixture(
        deployFixture
      );
      await stakedoverlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        admin.address
      );
      const t = await time.latest();
      await stakedoverlayerWrap.connect(admin).setBlackListTime(t + 1);
      await time.increase(60 * 60 * 24 * 15 + 1);
      await stakedoverlayerWrap
        .connect(admin)
        .addToBlacklist(alice.address, false);
      await expect(
        stakedoverlayerWrap
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.be.eventually.rejected;
    });
  });

  describe("Preview Redeem", function () {
    it("Should update preview redeem on asset injection", async function () {
      const { stakedoverlayerWrap, admin, overlayerWrap, alice, bob } =
        await loadFixture(deployFixture);
      await expect(
        await stakedoverlayerWrap
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.emit(stakedoverlayerWrap, "Deposit");
      await expect(
        await stakedoverlayerWrap
          .connect(bob)
          .deposit(ethers.parseEther("5"), bob.address)
      ).to.emit(stakedoverlayerWrap, "Deposit");
      await overlayerWrap
        .connect(admin)
        .transfer(
          await stakedoverlayerWrap.getAddress(),
          ethers.parseEther("15")
        );
      expect(await stakedoverlayerWrap.totalAssets()).to.equal(
        ethers.parseEther("31")
      );
      expect(await stakedoverlayerWrap.totalSupply()).to.equal(
        ethers.parseEther("16")
      );

      expect(
        await stakedoverlayerWrap.previewRedeem(ethers.parseEther("1"))
      ).to.be.greaterThan(ethers.parseEther("1.9"));
      expect(
        await stakedoverlayerWrap.previewRedeem(ethers.parseEther("1"))
      ).to.be.lessThan(ethers.parseEther("2.0"));

      //check unvested amount
      expect(await stakedoverlayerWrap.getUnvestedAmount()).to.equal(0);

      await overlayerWrap
        .connect(admin)
        .transfer(
          await stakedoverlayerWrap.getAddress(),
          ethers.parseEther("30")
        );

      expect(
        await stakedoverlayerWrap.previewRedeem(ethers.parseEther("1"))
      ).to.be.greaterThan(ethers.parseEther("3.8"));
      expect(
        await stakedoverlayerWrap.previewRedeem(ethers.parseEther("1"))
      ).to.be.lessThan(ethers.parseEther("4.0"));
    });
  });

  describe("Cooldown Shares & Unstake", function () {
    it("Should start cooldown", async function () {
      const { stakedoverlayerWrap, alice } = await loadFixture(deployFixture);
      await expect(
        await stakedoverlayerWrap
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.emit(stakedoverlayerWrap, "Deposit");
      await stakedoverlayerWrap
        .connect(alice)
        .cooldownShares(ethers.parseEther("5"));
      expect(await stakedoverlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther("5")
      );
      expect(
        (await stakedoverlayerWrap.cooldowns(alice.address)).underlyingAmount
      ).to.equal(ethers.parseEther("5"));
      const now = await time.latest();
      expect(
        (await stakedoverlayerWrap.cooldowns(alice.address)).cooldownEnd
      ).to.equal(now + 172800);
    });

    it("Should not unstake before cooldown", async function () {
      const { stakedoverlayerWrap, alice } = await loadFixture(deployFixture);
      await expect(
        await stakedoverlayerWrap
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.emit(stakedoverlayerWrap, "Deposit");
      await stakedoverlayerWrap
        .connect(alice)
        .cooldownShares(ethers.parseEther("5"));
      const now = await time.latest();
      expect(
        (await stakedoverlayerWrap.cooldowns(alice.address)).cooldownEnd
      ).to.equal(now + 172800);
      await expect(stakedoverlayerWrap.connect(alice).unstake(alice.address)).to
        .be.eventually.rejected;
      await time.increase(172759);
      await expect(stakedoverlayerWrap.connect(alice).unstake(alice.address)).to
        .be.eventually.rejected;
    });

    it("Should unstake after cooldown", async function () {
      const { stakedoverlayerWrap, admin, overlayerWrap, alice, bob } =
        await loadFixture(deployFixture);
      await stakedoverlayerWrap
        .connect(alice)
        .deposit(ethers.parseEther("10"), alice.address);
      await stakedoverlayerWrap
        .connect(bob)
        .deposit(ethers.parseEther("5"), bob.address);
      await overlayerWrap
        .connect(admin)
        .transfer(
          await stakedoverlayerWrap.getAddress(),
          ethers.parseEther("15")
        );
      await stakedoverlayerWrap
        .connect(alice)
        .cooldownShares(ethers.parseEther("10"));
      await stakedoverlayerWrap
        .connect(bob)
        .cooldownShares(ethers.parseEther("5"));
      await time.increase(182759);
      const beforeAliceBal = ethers.formatEther(
        await overlayerWrap.balanceOf(alice)
      );
      const beforeBobBal = ethers.formatEther(
        await overlayerWrap.balanceOf(bob)
      );
      await stakedoverlayerWrap.connect(alice).unstake(alice.address);
      await stakedoverlayerWrap.connect(bob).unstake(bob.address);
      const afterAliceBal = ethers.formatEther(
        await overlayerWrap.balanceOf(alice)
      );
      const afterBobBal = ethers.formatEther(
        await overlayerWrap.balanceOf(bob)
      );
      expect(
        Number.parseFloat(afterAliceBal) - Number.parseFloat(beforeAliceBal)
      ).to.be.greaterThan(19.0);
      expect(
        Number.parseFloat(afterAliceBal) - Number.parseFloat(beforeAliceBal)
      ).to.be.lessThan(20.1);
      expect(
        Number.parseFloat(afterBobBal) - Number.parseFloat(beforeBobBal)
      ).to.be.greaterThan(9.0);
      expect(
        Number.parseFloat(afterBobBal) - Number.parseFloat(beforeBobBal)
      ).to.be.lessThan(10.1);
    });
  });

  describe("ERC4626 flow", function () {
    it("Should unstake immediately", async function () {
      const { stakedoverlayerWrap, admin, overlayerWrap, alice, bob } =
        await loadFixture(deployFixture);

      //disable cool down
      await stakedoverlayerWrap.connect(admin).setCooldownDuration(0);

      await stakedoverlayerWrap
        .connect(alice)
        .deposit(ethers.parseEther("10"), alice.address);
      await stakedoverlayerWrap
        .connect(bob)
        .deposit(ethers.parseEther("5"), bob.address);
      await overlayerWrap
        .connect(admin)
        .transfer(
          await stakedoverlayerWrap.getAddress(),
          ethers.parseEther("15")
        );

      expect(await stakedoverlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther("10")
      );
      expect(await stakedoverlayerWrap.balanceOf(bob.address)).to.equal(
        ethers.parseEther("5")
      );

      const beforeAliceBal = ethers.formatEther(
        await overlayerWrap.balanceOf(alice)
      );
      const beforeBobBal = ethers.formatEther(
        await overlayerWrap.balanceOf(bob)
      );
      await stakedoverlayerWrap
        .connect(alice)
        .redeem(ethers.parseEther("10"), alice.address, alice.address);
      await stakedoverlayerWrap
        .connect(bob)
        .redeem(ethers.parseEther("5"), bob.address, bob.address);
      const afterAliceBal = ethers.formatEther(
        await overlayerWrap.balanceOf(alice)
      );
      const afterBobBal = ethers.formatEther(
        await overlayerWrap.balanceOf(bob)
      );
      expect(
        Number.parseFloat(afterAliceBal) - Number.parseFloat(beforeAliceBal)
      ).to.be.greaterThan(19.3);
      expect(
        Number.parseFloat(afterAliceBal) - Number.parseFloat(beforeAliceBal)
      ).to.be.lessThan(20.1);
      expect(
        Number.parseFloat(afterBobBal) - Number.parseFloat(beforeBobBal)
      ).to.be.greaterThan(9.3);
      expect(
        Number.parseFloat(afterBobBal) - Number.parseFloat(beforeBobBal)
      ).to.be.lessThan(10.1);
    });
  });
});
