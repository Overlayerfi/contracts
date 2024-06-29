import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("StakedUSDOFront", function () {
  async function deployFixture() {
    const [admin, alice, bob] = await ethers.getSigners();

    const Usdc = await ethers.getContractFactory("SixDecimalsUsd");
    const usdc = await Usdc.deploy(1000, "", "USDC");

    const Usdt = await ethers.getContractFactory("FixedSupplyERC20");
    const usdt = await Usdt.deploy(1000, "USDT", "USDT");

    const USDO = await ethers.getContractFactory("USDOM");
    const usdo = await USDO.deploy(
      await admin.getAddress(),
      {
        addr: await usdc.getAddress(),
        decimals: await usdc.decimals()
      },
      {
        addr: await usdt.getAddress(),
        decimals: await usdt.decimals()
      },
      ethers.parseEther("100000000"),
      ethers.parseEther("100000000")
    );

    //send some usdc and usdt to users
    await usdc
      .connect(admin)
      .transfer(alice.address, ethers.parseUnits("50", await usdc.decimals()));
    await usdc
      .connect(admin)
      .transfer(bob.address, ethers.parseUnits("50", await usdc.decimals()));
    await usdt
      .connect(admin)
      .transfer(alice.address, ethers.parseUnits("50", await usdt.decimals()));
    await usdt
      .connect(admin)
      .transfer(bob.address, ethers.parseUnits("50", await usdt.decimals()));

    await usdc
      .connect(alice)
      .approve(await usdo.getAddress(), ethers.MaxUint256);
    await usdc.connect(bob).approve(await usdo.getAddress(), ethers.MaxUint256);
    await usdc
      .connect(admin)
      .approve(await usdo.getAddress(), ethers.MaxUint256);
    await usdt
      .connect(alice)
      .approve(await usdo.getAddress(), ethers.MaxUint256);
    await usdt.connect(bob).approve(await usdo.getAddress(), ethers.MaxUint256);
    await usdt
      .connect(admin)
      .approve(await usdo.getAddress(), ethers.MaxUint256);

    // users mint usdo
    let mintOrder = {
      benefactor: alice.address,
      beneficiary: alice.address,
      collateral_usdt: await usdt.getAddress(),
      collateral_usdc: await usdc.getAddress(),
      collateral_usdt_amount: ethers.parseUnits("50", await usdt.decimals()),
      collateral_usdc_amount: ethers.parseUnits("50", await usdc.decimals()),
      usdo_amount: ethers.parseEther((50 * 2).toString())
    };
    await usdo.connect(alice).mint(mintOrder);
    mintOrder.benefactor = bob.address;
    mintOrder.beneficiary = bob.address;
    await usdo.connect(bob).mint(mintOrder);
    mintOrder.benefactor = admin.address;
    mintOrder.beneficiary = admin.address;
    mintOrder.collateral_usdc_amount = ethers.parseUnits(
      "100",
      await usdc.decimals()
    );
    mintOrder.collateral_usdt_amount = ethers.parseUnits(
      "100",
      await usdt.decimals()
    );
    mintOrder.usdo_amount = ethers.parseEther((100 * 2).toString());
    await usdo.connect(admin).mint(mintOrder);

    const StakedUSDO = await ethers.getContractFactory("StakedUSDOFront");
    const stakedusdo = await StakedUSDO.deploy(
      await usdo.getAddress(),
      admin.address,
      admin.address,
      0
    );

    await stakedusdo.connect(admin).setCooldownDuration(172800); // 2 days

    await usdo
      .connect(alice)
      .approve(await stakedusdo.getAddress(), ethers.MaxUint256);
    await usdo
      .connect(bob)
      .approve(await stakedusdo.getAddress(), ethers.MaxUint256);
    await usdo
      .connect(admin)
      .approve(await stakedusdo.getAddress(), ethers.MaxUint256);

    return { stakedusdo, usdc, usdt, usdo, admin, alice, bob };
  }

  describe("Deployment", function () {
    it("Should set the admin role", async function () {
      const { stakedusdo, admin } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      expect(await stakedusdo.owner()).to.equal(adminAddress);
    });

    it("Should set the rewarder role", async function () {
      const { stakedusdo, admin } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      expect(
        await stakedusdo.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("REWARDER_ROLE")),
          adminAddress
        )
      ).to.equal(true);
    });

    it("Should not have vesting time", async function () {
      const { stakedusdo } = await loadFixture(deployFixture);
      expect(await stakedusdo.vestingAmount()).to.equal(0);
    });
  });

  describe("Cooldown check", function () {
    it("Should disable ERC4626 withdraw", async function () {
      const { stakedusdo, alice } = await loadFixture(deployFixture);
      await expect(
        stakedusdo.connect(alice).withdraw(0, alice.address, alice.address)
      ).to.be.eventually.rejectedWith("OperationNotAllowed");
    });

    it("Should disable ERC4626 redeem", async function () {
      const { stakedusdo, alice } = await loadFixture(deployFixture);
      await expect(
        stakedusdo.connect(alice).redeem(0, alice.address, alice.address)
      ).to.be.eventually.rejectedWith("OperationNotAllowed");
    });
  });

  describe("Stake", function () {
    it("Should deposit", async function () {
      const { stakedusdo, admin, alice, bob } = await loadFixture(
        deployFixture
      );
      expect(await stakedusdo.totalAssets()).to.equal(0);
      expect(await stakedusdo.totalSupply()).to.equal(0);
      await expect(
        await stakedusdo
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.emit(stakedusdo, "Deposit");
      await expect(
        await stakedusdo
          .connect(bob)
          .deposit(ethers.parseEther("5"), bob.address)
      ).to.emit(stakedusdo, "Deposit");
      expect(await stakedusdo.totalAssets()).to.equal(ethers.parseEther("15"));
      expect(await stakedusdo.totalSupply()).to.equal(ethers.parseEther("15"));
      expect(await stakedusdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("10")
      );
      expect(await stakedusdo.balanceOf(bob.address)).to.equal(
        ethers.parseEther("5")
      );
      expect(await stakedusdo.balanceOf(admin.address)).to.equal(
        ethers.parseEther("0")
      );

      expect(await stakedusdo.previewRedeem(ethers.parseEther("1"))).to.equal(
        ethers.parseEther("1")
      );
    });

    it("Should not deposit if full blacklisted", async function () {
      const { stakedusdo, admin, alice } = await loadFixture(deployFixture);
      await stakedusdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        admin.address
      );
      await stakedusdo.connect(admin).addToBlacklist(alice.address, true);
      await expect(
        stakedusdo
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.be.eventually.rejectedWith("OperationNotAllowed");
    });

    it("Should not deposit if soft blacklisted", async function () {
      const { stakedusdo, admin, alice } = await loadFixture(deployFixture);
      await stakedusdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        admin.address
      );
      await stakedusdo.connect(admin).addToBlacklist(alice.address, false);
      await expect(
        stakedusdo
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.be.eventually.rejectedWith("OperationNotAllowed");
    });
  });

  describe("Preview Redeem", function () {
    it("Should update preview redeem on asset injection", async function () {
      const { stakedusdo, admin, usdo, alice, bob } = await loadFixture(
        deployFixture
      );
      await expect(
        await stakedusdo
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.emit(stakedusdo, "Deposit");
      await expect(
        await stakedusdo
          .connect(bob)
          .deposit(ethers.parseEther("5"), bob.address)
      ).to.emit(stakedusdo, "Deposit");
      await usdo
        .connect(admin)
        .transfer(await stakedusdo.getAddress(), ethers.parseEther("15"));
      expect(await stakedusdo.totalAssets()).to.equal(ethers.parseEther("30"));
      expect(await stakedusdo.totalSupply()).to.equal(ethers.parseEther("15"));

      expect(
        await stakedusdo.previewRedeem(ethers.parseEther("1"))
      ).to.be.greaterThan(ethers.parseEther("1.9"));
      expect(
        await stakedusdo.previewRedeem(ethers.parseEther("1"))
      ).to.be.lessThan(ethers.parseEther("2.0"));

      //check unvested amount
      expect(await stakedusdo.getUnvestedAmount()).to.equal(0);

      await usdo
        .connect(admin)
        .transfer(await stakedusdo.getAddress(), ethers.parseEther("30"));

      expect(
        await stakedusdo.previewRedeem(ethers.parseEther("1"))
      ).to.be.greaterThan(ethers.parseEther("3.9"));
      expect(
        await stakedusdo.previewRedeem(ethers.parseEther("1"))
      ).to.be.lessThan(ethers.parseEther("4.0"));
    });
  });

  describe("Cooldown Shares & Unstake", function () {
    it("Should start cooldown", async function () {
      const { stakedusdo, alice } = await loadFixture(deployFixture);
      await expect(
        await stakedusdo
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.emit(stakedusdo, "Deposit");
      await stakedusdo.connect(alice).cooldownShares(ethers.parseEther("5"));
      expect(await stakedusdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("5")
      );
      expect(
        (await stakedusdo.cooldowns(alice.address)).underlyingAmount
      ).to.equal(ethers.parseEther("5"));
      const now = await time.latest();
      expect((await stakedusdo.cooldowns(alice.address)).cooldownEnd).to.equal(
        now + 172800
      );
    });

    it("Should not unstake before cooldown", async function () {
      const { stakedusdo, alice } = await loadFixture(deployFixture);
      await expect(
        await stakedusdo
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.emit(stakedusdo, "Deposit");
      await stakedusdo.connect(alice).cooldownShares(ethers.parseEther("5"));
      const now = await time.latest();
      expect((await stakedusdo.cooldowns(alice.address)).cooldownEnd).to.equal(
        now + 172800
      );
      await expect(
        stakedusdo.connect(alice).unstake(alice.address)
      ).to.be.eventually.rejectedWith("StakedUSDOInvalidCooldown");
      await time.increase(172759);
      await expect(
        stakedusdo.connect(alice).unstake(alice.address)
      ).to.be.eventually.rejectedWith("StakedUSDOInvalidCooldown");
    });

    it("Should unstake after cooldown", async function () {
      const { stakedusdo, admin, usdo, alice, bob } = await loadFixture(
        deployFixture
      );
      await stakedusdo
        .connect(alice)
        .deposit(ethers.parseEther("10"), alice.address);
      await stakedusdo
        .connect(bob)
        .deposit(ethers.parseEther("5"), bob.address);
      await usdo
        .connect(admin)
        .transfer(await stakedusdo.getAddress(), ethers.parseEther("15"));
      await stakedusdo.connect(alice).cooldownShares(ethers.parseEther("10"));
      await stakedusdo.connect(bob).cooldownShares(ethers.parseEther("5"));
      await time.increase(182759);
      const beforeAliceBal = ethers.formatEther(await usdo.balanceOf(alice));
      const beforeBobBal = ethers.formatEther(await usdo.balanceOf(bob));
      await stakedusdo.connect(alice).unstake(alice.address);
      await stakedusdo.connect(bob).unstake(bob.address);
      const afterAliceBal = ethers.formatEther(await usdo.balanceOf(alice));
      const afterBobBal = ethers.formatEther(await usdo.balanceOf(bob));
      expect(
        Number.parseFloat(afterAliceBal) - Number.parseFloat(beforeAliceBal)
      ).to.be.greaterThan(19.9);
      expect(
        Number.parseFloat(afterAliceBal) - Number.parseFloat(beforeAliceBal)
      ).to.be.lessThan(20.1);
      expect(
        Number.parseFloat(afterBobBal) - Number.parseFloat(beforeBobBal)
      ).to.be.greaterThan(9.9);
      expect(
        Number.parseFloat(afterBobBal) - Number.parseFloat(beforeBobBal)
      ).to.be.lessThan(10.1);
    });
  });
});
