import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("AirdropOBSIReceipt", function () {
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

    const AirdropOBSIReceipt = await ethers.getContractFactory(
      "AirdropOBSIReceipt"
    );
    const airdropusdoreceipt = await AirdropOBSIReceipt.deploy(
      await usdo.getAddress(),
      admin.address
    );

    await usdo
      .connect(alice)
      .approve(await airdropusdoreceipt.getAddress(), ethers.MaxUint256);
    await usdo
      .connect(bob)
      .approve(await airdropusdoreceipt.getAddress(), ethers.MaxUint256);
    await usdo
      .connect(admin)
      .approve(await airdropusdoreceipt.getAddress(), ethers.MaxUint256);

    return { airdropusdoreceipt, usdc, usdt, usdo, admin, alice, bob };
  }

  describe("Deployment", function () {
    it("Should set the admin role", async function () {
      const { airdropusdoreceipt, admin } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      expect(await airdropusdoreceipt.owner()).to.equal(adminAddress);
    });
  });

  describe("Stake", function () {
    it("Should mint", async function () {
      const { airdropusdoreceipt, admin, alice, bob } = await loadFixture(
        deployFixture
      );
      expect(await airdropusdoreceipt.totalAssets()).to.equal(0);
      expect(await airdropusdoreceipt.totalSupply()).to.equal(0);
      await expect(
        await airdropusdoreceipt
          .connect(alice)
          .mint(ethers.parseEther("10"), alice.address)
      ).to.emit(airdropusdoreceipt, "Deposit");
      await expect(
        await airdropusdoreceipt
          .connect(bob)
          .mint(ethers.parseEther("5"), bob.address)
      ).to.emit(airdropusdoreceipt, "Deposit");
      expect(await airdropusdoreceipt.totalAssets()).to.equal(
        ethers.parseEther("15")
      );
      expect(await airdropusdoreceipt.totalSupply()).to.equal(
        ethers.parseEther("15")
      );
      expect(await airdropusdoreceipt.balanceOf(alice.address)).to.equal(
        ethers.parseEther("10")
      );
      expect(await airdropusdoreceipt.balanceOf(bob.address)).to.equal(
        ethers.parseEther("5")
      );
      expect(await airdropusdoreceipt.balanceOf(admin.address)).to.equal(
        ethers.parseEther("0")
      );

      expect(
        await airdropusdoreceipt.previewRedeem(ethers.parseEther("1"))
      ).to.equal(ethers.parseEther("1"));
    });

    it("Should deposit", async function () {
      const { airdropusdoreceipt, admin, alice, bob } = await loadFixture(
        deployFixture
      );
      expect(await airdropusdoreceipt.totalAssets()).to.equal(0);
      expect(await airdropusdoreceipt.totalSupply()).to.equal(0);
      await expect(
        await airdropusdoreceipt
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.emit(airdropusdoreceipt, "Deposit");
      await expect(
        await airdropusdoreceipt
          .connect(bob)
          .deposit(ethers.parseEther("5"), bob.address)
      ).to.emit(airdropusdoreceipt, "Deposit");
      expect(await airdropusdoreceipt.totalAssets()).to.equal(
        ethers.parseEther("15")
      );
      expect(await airdropusdoreceipt.totalSupply()).to.equal(
        ethers.parseEther("15")
      );
      expect(await airdropusdoreceipt.balanceOf(alice.address)).to.equal(
        ethers.parseEther("10")
      );
      expect(await airdropusdoreceipt.balanceOf(bob.address)).to.equal(
        ethers.parseEther("5")
      );
      expect(await airdropusdoreceipt.balanceOf(admin.address)).to.equal(
        ethers.parseEther("0")
      );

      expect(
        await airdropusdoreceipt.previewRedeem(ethers.parseEther("1"))
      ).to.equal(ethers.parseEther("1"));
    });

    it("Should not deposit if full blacklisted", async function () {
      const { airdropusdoreceipt, admin, alice } = await loadFixture(
        deployFixture
      );
      await airdropusdoreceipt.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        admin.address
      );
      await airdropusdoreceipt
        .connect(admin)
        .addToBlacklist(alice.address, true);
      await expect(
        airdropusdoreceipt
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.be.eventually.rejectedWith("OperationNotAllowed");
    });

    it("Should not deposit if soft blacklisted", async function () {
      const { airdropusdoreceipt, admin, alice } = await loadFixture(
        deployFixture
      );
      await airdropusdoreceipt.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        admin.address
      );
      await airdropusdoreceipt
        .connect(admin)
        .addToBlacklist(alice.address, false);
      await expect(
        airdropusdoreceipt
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.be.eventually.rejectedWith("OperationNotAllowed");
    });
  });

  describe("Transfer", function () {
    it("Should not be transferable", async function () {
      const { airdropusdoreceipt, alice, bob } = await loadFixture(
        deployFixture
      );
      expect(await airdropusdoreceipt.totalAssets()).to.equal(0);
      expect(await airdropusdoreceipt.totalSupply()).to.equal(0);
      await expect(
        await airdropusdoreceipt
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.emit(airdropusdoreceipt, "Deposit");
      expect(await airdropusdoreceipt.totalAssets()).to.equal(
        ethers.parseEther("10")
      );
      expect(await airdropusdoreceipt.totalSupply()).to.equal(
        ethers.parseEther("10")
      );
      expect(await airdropusdoreceipt.balanceOf(alice.address)).to.equal(
        ethers.parseEther("10")
      );
      await expect(
        airdropusdoreceipt
          .connect(alice)
          .transfer(bob.address, ethers.parseEther("1"))
      ).to.be.eventually.rejectedWith("OperationNotAllowed");
    });

    it("Should not be redeemable", async function () {
      const { airdropusdoreceipt, alice, bob } = await loadFixture(
        deployFixture
      );
      expect(await airdropusdoreceipt.totalAssets()).to.equal(0);
      expect(await airdropusdoreceipt.totalSupply()).to.equal(0);
      await expect(
        await airdropusdoreceipt
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.emit(airdropusdoreceipt, "Deposit");
      expect(await airdropusdoreceipt.totalAssets()).to.equal(
        ethers.parseEther("10")
      );
      expect(await airdropusdoreceipt.totalSupply()).to.equal(
        ethers.parseEther("10")
      );
      expect(await airdropusdoreceipt.balanceOf(alice.address)).to.equal(
        ethers.parseEther("10")
      );
      await expect(
        airdropusdoreceipt
          .connect(alice)
          .redeem(ethers.parseEther("10"), alice.address, alice.address)
      ).to.be.eventually.rejectedWith("OperationNotAllowed");
    });

    it("Should not be withdrawable", async function () {
      const { airdropusdoreceipt, alice } = await loadFixture(deployFixture);
      expect(await airdropusdoreceipt.totalAssets()).to.equal(0);
      expect(await airdropusdoreceipt.totalSupply()).to.equal(0);
      await expect(
        await airdropusdoreceipt
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.emit(airdropusdoreceipt, "Deposit");
      expect(await airdropusdoreceipt.totalAssets()).to.equal(
        ethers.parseEther("10")
      );
      expect(await airdropusdoreceipt.totalSupply()).to.equal(
        ethers.parseEther("10")
      );
      expect(await airdropusdoreceipt.balanceOf(alice.address)).to.equal(
        ethers.parseEther("10")
      );
      await expect(
        airdropusdoreceipt
          .connect(alice)
          .withdraw(ethers.parseEther("10"), alice.address, alice.address)
      ).to.be.eventually.rejectedWith("OperationNotAllowed");
    });
  });
});
