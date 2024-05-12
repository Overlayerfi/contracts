import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { equal } from "assert";

describe("USDOM", function () {
  async function deployFixture() {
    const [admin, gatekeeper, alice, bob] = await ethers.getSigners();

    const Usdc = await ethers.getContractFactory("SixDecimalsUsd");
    const usdc = await Usdc.deploy(100, "USDC", "USDC");

    const Usdt = await ethers.getContractFactory("SixDecimalsUsd");
    const usdt = await Usdt.deploy(100, "USDT", "USDT");

    const Contract = await ethers.getContractFactory("USDOM");
    const contract = await Contract.deploy(
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
      .approve(
        await contract.getAddress(),
        ethers.parseUnits("50", await usdc.decimals())
      );
    await usdc
      .connect(bob)
      .approve(
        await contract.getAddress(),
        ethers.parseUnits("50", await usdc.decimals())
      );
    await usdt
      .connect(alice)
      .approve(
        await contract.getAddress(),
        ethers.parseUnits("50", await usdt.decimals())
      );
    await usdt
      .connect(bob)
      .approve(
        await contract.getAddress(),
        ethers.parseUnits("50", await usdt.decimals())
      );

    return { usdc, usdt, contract, admin, gatekeeper, alice, bob };
  }

  describe("Deployment", function () {
    it("Should set the admin", async function () {
      const { contract, admin } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      expect(await contract.owner()).to.equal(adminAddress);
    });
  });

  describe("Collateral Manager", function () {
    it("Should set first collateral manager", async function () {
      const { contract, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await contract.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(await contract.approvedCollateralSpender()).to.be.equal(
        ethers.ZeroAddress
      );
      await contract.connect(admin).proposeNewCollateralSpender(alice.address);
      expect(await contract.proposedSpender()).to.be.equal(alice.address);
      await contract.connect(admin).acceptProposedCollateralSpender();
      expect(await contract.approvedCollateralSpender()).to.be.equal(
        alice.address
      );
    });

    it("Should not propose spender if not allowed", async function () {
      const { contract, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await contract.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      await expect(
        contract.connect(alice).proposeNewCollateralSpender(alice.address)
      ).to.be.eventually.rejected;
    });

    it("Should set next collateral manager", async function () {
      const { contract, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await contract.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(await contract.approvedCollateralSpender()).to.be.equal(
        ethers.ZeroAddress
      );
      await contract.connect(admin).proposeNewCollateralSpender(alice.address);
      expect(await contract.proposedSpender()).to.be.equal(alice.address);
      await contract.connect(admin).acceptProposedCollateralSpender();
      expect(await contract.approvedCollateralSpender()).to.be.equal(
        alice.address
      );

      //change from alice spender to admin
      await contract.connect(admin).proposeNewCollateralSpender(admin.address);
      expect(await contract.proposedSpender()).to.be.equal(admin.address);
      const oldTime = await time.latest();
      expect(await contract.proposalTime()).to.be.equal(oldTime);

      await time.increase(14 * 24 * 60 * 60);

      await contract.connect(admin).acceptProposedCollateralSpender();
      expect(await contract.approvedCollateralSpender()).to.be.equal(
        admin.address
      );
    });

    it("Should not set next collateral manager if time not respected", async function () {
      const { contract, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await contract.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(await contract.approvedCollateralSpender()).to.be.equal(
        ethers.ZeroAddress
      );
      await contract.connect(admin).proposeNewCollateralSpender(alice.address);
      expect(await contract.proposedSpender()).to.be.equal(alice.address);
      await contract.connect(admin).acceptProposedCollateralSpender();
      expect(await contract.approvedCollateralSpender()).to.be.equal(
        alice.address
      );

      //change from alice spender to admin
      await contract.connect(admin).proposeNewCollateralSpender(admin.address);
      expect(await contract.proposedSpender()).to.be.equal(admin.address);
      const oldTime = await time.latest();
      expect(await contract.proposalTime()).to.be.equal(oldTime);

      await time.increase(14 * 24 * 60 * 59);

      await expect(
        contract.connect(admin).acceptProposedCollateralSpender()
      ).to.be.eventually.rejectedWith("IntervalNotRespected");
    });
  });

  describe("Roles", function () {
    it("Should set the collateral manager", async function () {
      const { contract, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      const aliceAddress = await alice.getAddress();
      await contract.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(
        await contract.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
          collateralManagerAddress
        )
      ).to.equal(true);
      expect(
        await contract.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
          aliceAddress
        )
      ).to.equal(false);
    });

    it("Should set the gatekeeper", async function () {
      const { contract, gatekeeper, alice } = await loadFixture(deployFixture);
      const gatekeeperAddress = await gatekeeper.getAddress();
      const aliceAddress = await alice.getAddress();
      await contract.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        gatekeeperAddress
      );
      expect(
        await contract.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
          gatekeeperAddress
        )
      ).to.equal(true);
      expect(
        await contract.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
          aliceAddress
        )
      ).to.equal(false);
    });
  });

  describe("Mint Redeem Per Block", function () {
    it("Should set initial values", async function () {
      const { contract } = await loadFixture(deployFixture);
      expect(await contract.maxMintPerBlock()).to.equal(
        ethers.parseEther("100000000")
      );
      expect(await contract.maxRedeemPerBlock()).to.equal(
        ethers.parseEther("100000000")
      );
    });

    it("Should change values", async function () {
      const { contract, admin, gatekeeper } = await loadFixture(deployFixture);
      await contract.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        await gatekeeper.getAddress()
      );
      await expect(
        contract
          .connect(gatekeeper)
          .setMaxMintPerBlock(ethers.parseEther("90000000"))
      ).to.be.eventually.rejected;
      await expect(
        contract
          .connect(gatekeeper)
          .setMaxRedeemPerBlock(ethers.parseEther("90000000"))
      ).to.be.eventually.rejected;
      await contract
        .connect(admin)
        .setMaxMintPerBlock(ethers.parseEther("90000000"));
      await contract
        .connect(admin)
        .setMaxRedeemPerBlock(ethers.parseEther("90000000"));
      expect(await contract.maxMintPerBlock()).to.equal(
        ethers.parseEther("90000000")
      );
      expect(await contract.maxRedeemPerBlock()).to.equal(
        ethers.parseEther("90000000")
      );
    });

    it("Should stop mint and redeem", async function () {
      const { contract, admin, gatekeeper } = await loadFixture(deployFixture);
      await contract.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        await gatekeeper.getAddress()
      );
      await expect(contract.connect(admin).disableMintRedeem()).to.be.eventually
        .rejected;
      await contract.connect(gatekeeper).disableMintRedeem();
      expect(await contract.maxMintPerBlock()).to.equal(ethers.parseEther("0"));
      expect(await contract.maxRedeemPerBlock()).to.equal(
        ethers.parseEther("0")
      );
    });
  });

  describe("Mint", function () {
    it("Should mint", async function () {
      const { usdc, usdt, contract, admin, alice } = await loadFixture(
        deployFixture
      );
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits("10", await usdt.decimals()),
        collateral_usdc_amount: ethers.parseUnits("10", await usdc.decimals()),
        usdo_amount: ethers.parseEther("20")
      };
      const contractAddr = await contract.getAddress();
      expect(await contract.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
      await contract.connect(alice).mint(order);
      expect(await contract.balanceOf(alice.address)).to.equal(
        ethers.parseEther("20")
      );
      expect(await usdt.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("10", await usdt.decimals())
      );
      expect(await usdc.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("10", await usdc.decimals())
      );
    });

    it("Should mint small amount", async function () {
      const { usdc, usdt, contract, admin, alice } = await loadFixture(
        deployFixture
      );
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits("1", await usdt.decimals()),
        collateral_usdc_amount: ethers.parseUnits("1", await usdc.decimals()),
        usdo_amount: ethers.parseEther("2")
      };
      const contractAddr = await contract.getAddress();
      expect(await contract.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
      await contract.connect(alice).mint(order);
      expect(await contract.balanceOf(alice.address)).to.equal(
        ethers.parseEther("2")
      );
      expect(await usdt.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("1", await usdt.decimals())
      );
      expect(await usdc.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("1", await usdc.decimals())
      );
    });

    it("Should mint too small amount", async function () {
      const { admin, usdc, usdt, contract, alice } = await loadFixture(
        deployFixture
      );
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits(
          "0.9999",
          await usdt.decimals()
        ),
        collateral_usdc_amount: ethers.parseUnits(
          "0.9999",
          await usdc.decimals()
        ),
        usdo_amount: ethers.parseEther("1.9998")
      };
      const contractAddr = await contract.getAddress();
      await expect(contract.connect(alice).mint(order)).to.not.be.eventually
        .rejected;
      expect(await contract.balanceOf(alice.address)).to.equal(
        ethers.parseEther((0.9999 * 2).toString())
      );
      expect(await usdt.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("0.9999", await usdt.decimals())
      );
      expect(await usdc.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("0.9999", await usdc.decimals())
      );
    });

    it("Should not mint on wrong ratio", async function () {
      const { usdc, usdt, contract, alice } = await loadFixture(deployFixture);
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits("10", await usdt.decimals()),
        collateral_usdc_amount: ethers.parseUnits(
          "9.9999",
          await usdc.decimals()
        ),
        usdo_amount: ethers.parseEther("20")
      };
      await expect(
        contract.connect(alice).mint(order)
      ).to.be.eventually.rejectedWith("DifferentAssetsAmounts");
      expect(await contract.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
      order.collateral_usdc_amount = ethers.parseUnits(
        "10",
        await usdc.decimals()
      );
      order.collateral_usdt_amount = ethers.parseUnits(
        "10.00001",
        await usdc.decimals()
      );
      await expect(
        contract.connect(alice).mint(order)
      ).to.be.eventually.rejectedWith("DifferentAssetsAmounts");
      expect(await contract.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
    });

    it("Should not mint on unsufficient balance", async function () {
      const { usdc, usdt, contract, alice } = await loadFixture(deployFixture);
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits(
          "50.001",
          await usdt.decimals()
        ),
        collateral_usdc_amount: ethers.parseUnits(
          "50.001",
          await usdc.decimals()
        ),
        usdo_amount: ethers.parseEther("20")
      };
      await expect(contract.connect(alice).mint(order)).to.be.eventually
        .rejected;
      expect(await contract.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
    });
  });

  describe("Redeem", function () {
    it("Should redeem", async function () {
      const { usdc, usdt, contract, admin, alice } = await loadFixture(
        deployFixture
      );
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits("10", await usdt.decimals()),
        collateral_usdc_amount: ethers.parseUnits("10", await usdc.decimals()),
        usdo_amount: ethers.parseEther("20")
      };
      await contract.connect(alice).mint(order);
      expect(await contract.balanceOf(alice.address)).to.equal(
        ethers.parseEther("20")
      );
      expect(await contract.connect(alice).redeem(order)).to.emit(
        contract,
        "Transfer"
      );
      expect(await contract.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
      expect(await usdt.balanceOf(await contract.getAddress())).to.equal(
        ethers.parseUnits("0", await usdt.decimals())
      );
      expect(await usdc.balanceOf(await contract.getAddress())).to.equal(
        ethers.parseUnits("0", await usdc.decimals())
      );
      expect(await usdt.balanceOf(alice.address)).to.equal(
        ethers.parseUnits("50", await usdt.decimals())
      );
      expect(await usdc.balanceOf(alice.address)).to.equal(
        ethers.parseUnits("50", await usdc.decimals())
      );
    });

    it("Should not redeem on low USDO balance", async function () {
      const { usdc, usdt, contract, admin, alice } = await loadFixture(
        deployFixture
      );
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits("10", await usdt.decimals()),
        collateral_usdc_amount: ethers.parseUnits("10", await usdc.decimals()),
        usdo_amount: ethers.parseEther("20")
      };
      await contract.connect(alice).mint(order);
      const redeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits(
          "10.0001",
          await usdt.decimals()
        ),
        collateral_usdc_amount: ethers.parseUnits(
          "10.0001",
          await usdc.decimals()
        ),
        usdo_amount: ethers.parseEther("20.0002")
      };
      expect(await contract.balanceOf(alice.address)).to.equal(
        ethers.parseEther("20")
      );
      await expect(
        contract.connect(alice).redeem(redeemOrder)
      ).to.be.eventually.rejectedWith("ERC20InsufficientBalance");
    });
  });
});
