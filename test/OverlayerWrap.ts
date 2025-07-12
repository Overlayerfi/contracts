import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

import OVERLAYER_WRAP_ABI from "../artifacts/contracts/overlayer/OverlayerWrap.sol/OverlayerWrap.json";

describe("OverlayerWrap", function () {
  async function deployFixture() {
    const [admin, gatekeeper, alice, bob] = await ethers.getSigners();

    const block = await admin.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(10)
    };

    const Collateral = await ethers.getContractFactory("SixDecimalsUsd");
    const collateral = await Collateral.deploy(
      1000,
      "COLLATERAL",
      "COLLATERAL",
      defaultTransactionOptions
    );
    const aCollateral = await ethers.getContractFactory("SixDecimalsUsd");
    const acollateral = await aCollateral.deploy(
      1000,
      "aCOLLATERAL",
      "aCOLLATERAL",
      defaultTransactionOptions
    );

    const Factory = await ethers.getContractFactory("OverlayerWrapFactory");
    const factory = await Factory.deploy(
      await admin.getAddress(),
      await admin.getAddress(),
      defaultTransactionOptions
    );
    await factory.waitForDeployment();

    const overlayerWrapAddressTx = await factory.deployInitialOverlayerWrap(
      {
        addr: await collateral.getAddress(),
        decimals: await collateral.decimals()
      },
      {
        addr: await acollateral.getAddress(),
        decimals: await acollateral.decimals()
      },
      ethers.parseEther("100000000"),
      ethers.parseEther("100000000")
    );
    await overlayerWrapAddressTx.wait();
    const overlayerWrapAddress = await factory.symbolToToken("USDT+");
    const overlayerWrap = new ethers.Contract(
      overlayerWrapAddress,
      OVERLAYER_WRAP_ABI.abi,
      admin
    );

    const userAmount = "50";

    //send some usdc and usdt to users
    await collateral
      .connect(admin)
      .transfer(
        alice.address,
        ethers.parseUnits(userAmount, await collateral.decimals())
      );
    await acollateral
      .connect(admin)
      .transfer(
        alice.address,
        ethers.parseUnits(userAmount, await acollateral.decimals())
      );
    await collateral
      .connect(admin)
      .transfer(
        bob.address,
        ethers.parseUnits(userAmount, await collateral.decimals())
      );
    await acollateral
      .connect(admin)
      .transfer(
        bob.address,
        ethers.parseUnits(userAmount, await acollateral.decimals())
      );

    await collateral
      .connect(alice)
      .approve(
        await overlayerWrap.getAddress(),
        ethers.parseUnits(userAmount, await collateral.decimals())
      );
    await collateral
      .connect(bob)
      .approve(
        await overlayerWrap.getAddress(),
        ethers.parseUnits(userAmount, await collateral.decimals())
      );
    await acollateral
      .connect(alice)
      .approve(
        await overlayerWrap.getAddress(),
        ethers.parseUnits(userAmount, await acollateral.decimals())
      );
    await acollateral
      .connect(bob)
      .approve(
        await overlayerWrap.getAddress(),
        ethers.parseUnits(userAmount, await acollateral.decimals())
      );

    return {
      collateral,
      acollateral,
      overlayerWrap,
      admin,
      gatekeeper,
      alice,
      bob,
      userAmount
    };
  }

  describe("Deployment", function () {
    it("Should set the admin", async function () {
      const { overlayerWrap, admin } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      expect(await overlayerWrap.owner()).to.equal(adminAddress);
    });
  });

  describe("Deployment", function () {
    it("Should pause", async function () {
      const { overlayerWrap, admin, collateral } = await loadFixture(
        deployFixture
      );
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        admin.address
      );
      await overlayerWrap.connect(admin).pause();
      expect(await overlayerWrap.paused()).to.equal(true);
      await expect(overlayerWrap.connect(admin).supplyToBacking(0)).to.be
        .eventually.rejected;
    });

    it("Should unpause", async function () {
      const { overlayerWrap, admin } = await loadFixture(deployFixture);
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        admin.address
      );
      await overlayerWrap.connect(admin).pause();
      expect(await overlayerWrap.paused()).to.equal(true);
      await overlayerWrap.connect(admin).unpause();
      expect(await overlayerWrap.paused()).to.equal(false);
    });
  });

  describe("OverlayerWrapCollateral Manager", function () {
    it("Should set first collateral manager", async function () {
      const { overlayerWrap, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(await overlayerWrap.getSpender()).to.be.equal(ethers.ZeroAddress);
      await overlayerWrap
        .connect(admin)
        .proposeNewCollateralSpender(alice.address);
      expect(await overlayerWrap.proposedSpender()).to.be.equal(alice.address);
      await overlayerWrap.connect(alice).acceptProposedCollateralSpender();
      expect(await overlayerWrap.getSpender()).to.be.equal(alice.address);
    });

    it("Should reject acceptance if not the proposed spender", async function () {
      const { overlayerWrap, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(await overlayerWrap.getSpender()).to.be.equal(ethers.ZeroAddress);
      await overlayerWrap
        .connect(admin)
        .proposeNewCollateralSpender(alice.address);
      expect(await overlayerWrap.proposedSpender()).to.be.equal(alice.address);
      await expect(
        overlayerWrap.connect(admin).acceptProposedCollateralSpender()
      ).to.be.eventually.rejected;
    });

    it("Should not propose spender if not allowed", async function () {
      const { overlayerWrap, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      await expect(
        overlayerWrap.connect(alice).proposeNewCollateralSpender(alice.address)
      ).to.be.eventually.rejected;
    });

    it("Should set next collateral manager", async function () {
      const { overlayerWrap, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(await overlayerWrap.getSpender()).to.be.equal(ethers.ZeroAddress);
      await overlayerWrap
        .connect(admin)
        .proposeNewCollateralSpender(alice.address);
      expect(await overlayerWrap.proposedSpender()).to.be.equal(alice.address);
      await overlayerWrap.connect(alice).acceptProposedCollateralSpender();
      expect(await overlayerWrap.getSpender()).to.be.equal(alice.address);

      //change from alice spender to admin
      await overlayerWrap
        .connect(admin)
        .proposeNewCollateralSpender(admin.address);
      expect(await overlayerWrap.proposedSpender()).to.be.equal(admin.address);
      const oldTime = await time.latest();
      expect(await overlayerWrap.proposalTime()).to.be.equal(oldTime);

      await time.increase(10 * 24 * 60 * 60);

      await overlayerWrap.connect(admin).acceptProposedCollateralSpender();
      expect(await overlayerWrap.getSpender()).to.be.equal(admin.address);
    });

    it("Should not set next collateral manager if time not respected", async function () {
      const { overlayerWrap, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(await overlayerWrap.getSpender()).to.be.equal(ethers.ZeroAddress);
      await overlayerWrap
        .connect(admin)
        .proposeNewCollateralSpender(alice.address);
      expect(await overlayerWrap.proposedSpender()).to.be.equal(alice.address);
      await overlayerWrap.connect(alice).acceptProposedCollateralSpender();
      expect(await overlayerWrap.getSpender()).to.be.equal(alice.address);

      //change from alice spender to admin
      await overlayerWrap
        .connect(admin)
        .proposeNewCollateralSpender(admin.address);
      expect(await overlayerWrap.proposedSpender()).to.be.equal(admin.address);
      const oldTime = await time.latest();
      expect(await overlayerWrap.proposalTime()).to.be.equal(oldTime);

      await time.increase(10 * 24 * 60 * 59);

      await expect(
        overlayerWrap.connect(admin).acceptProposedCollateralSpender()
      ).to.be.eventually.rejected;
    });
  });

  describe("Roles", function () {
    it("Should set the collateral manager", async function () {
      const { overlayerWrap, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      const aliceAddress = await alice.getAddress();
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(
        await overlayerWrap.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
          collateralManagerAddress
        )
      ).to.equal(true);
      expect(
        await overlayerWrap.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
          aliceAddress
        )
      ).to.equal(false);
    });

    it("Should set the gatekeeper", async function () {
      const { overlayerWrap, gatekeeper, alice } = await loadFixture(
        deployFixture
      );
      const gatekeeperAddress = await gatekeeper.getAddress();
      const aliceAddress = await alice.getAddress();
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        gatekeeperAddress
      );
      expect(
        await overlayerWrap.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
          gatekeeperAddress
        )
      ).to.equal(true);
      expect(
        await overlayerWrap.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
          aliceAddress
        )
      ).to.equal(false);
    });

    it("Should not blacklist if its not active", async function () {
      const { overlayerWrap, gatekeeper, alice, bob } = await loadFixture(
        deployFixture
      );
      const blacklisterAddress = await gatekeeper.getAddress();
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        blacklisterAddress
      );

      const lastTime = await time.latest();
      await overlayerWrap.connect(gatekeeper).setBlackListTime(lastTime + 1);
      // blacklist time is 15 days
      await time.increase(3600 * 24 * 14);

      await expect(
        overlayerWrap.connect(gatekeeper).disableAccount(alice.address)
      ).to.be.eventually.rejected;
    });

    it("Should set blacklister and blacklist account", async function () {
      const { overlayerWrap, gatekeeper, alice, bob, admin } =
        await loadFixture(deployFixture);
      const blacklisterAddress = await gatekeeper.getAddress();
      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        blacklisterAddress
      );
      expect(
        await overlayerWrap.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
          blacklisterAddress
        )
      ).to.equal(true);
      expect(
        await overlayerWrap.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
          aliceAddress
        )
      ).to.equal(false);

      await expect(
        overlayerWrap.connect(alice).disableAccount(blacklisterAddress)
      ).to.be.eventually.rejected;

      const lastTime = await time.latest();
      await overlayerWrap.connect(gatekeeper).setBlackListTime(lastTime + 1);
      await time.increase(3600 * 24 * 15 + 1);

      await overlayerWrap.connect(gatekeeper).disableAccount(bobAddress);
      const role = ethers.keccak256(ethers.toUtf8Bytes("BLACKLISTED_ROLE"));
      expect(await overlayerWrap.hasRole(role, bobAddress)).to.be.equal(true);

      await overlayerWrap.connect(gatekeeper).enableAccount(bobAddress);
      expect(await overlayerWrap.hasRole(role, bobAddress)).to.be.equal(false);
    });
  });

  describe("Mint Redeem Per Block", function () {
    it("Should set initial values", async function () {
      const { overlayerWrap } = await loadFixture(deployFixture);
      expect(await overlayerWrap.maxMintPerBlock()).to.equal(
        ethers.parseEther("100000000")
      );
      expect(await overlayerWrap.maxRedeemPerBlock()).to.equal(
        ethers.parseEther("100000000")
      );
    });

    it("Should change values", async function () {
      const { overlayerWrap, admin, gatekeeper } = await loadFixture(
        deployFixture
      );
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        await gatekeeper.getAddress()
      );
      await expect(
        overlayerWrap
          .connect(gatekeeper)
          .setMaxMintPerBlock(ethers.parseEther("90000000"))
      ).to.be.eventually.rejected;
      await expect(
        overlayerWrap
          .connect(gatekeeper)
          .setMaxRedeemPerBlock(ethers.parseEther("90000000"))
      ).to.be.eventually.rejected;
      await overlayerWrap
        .connect(admin)
        .setMaxMintPerBlock(ethers.parseEther("90000000"));
      await overlayerWrap
        .connect(admin)
        .setMaxRedeemPerBlock(ethers.parseEther("90000000"));
      expect(await overlayerWrap.maxMintPerBlock()).to.equal(
        ethers.parseEther("90000000")
      );
      expect(await overlayerWrap.maxRedeemPerBlock()).to.equal(
        ethers.parseEther("90000000")
      );
    });

    it("Should stop mint", async function () {
      const { overlayerWrap, admin, gatekeeper } = await loadFixture(
        deployFixture
      );
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        await gatekeeper.getAddress()
      );
      await expect(overlayerWrap.connect(admin).disableMint()).to.be.eventually
        .rejected;
      await overlayerWrap.connect(gatekeeper).disableMint();
      expect(await overlayerWrap.maxMintPerBlock()).to.equal(
        ethers.parseEther("0")
      );
    });
  });

  describe("Mint", function () {
    it("Should mint", async function () {
      const { collateral, overlayerWrap, admin, alice } = await loadFixture(
        deployFixture
      );
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await collateral.getAddress(),
        collateralAmount: ethers.parseUnits("20", await collateral.decimals()),
        overlayerWrapAmount: ethers.parseEther("20")
      };
      const contractAddr = await overlayerWrap.getAddress();
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
      await overlayerWrap.connect(alice).mint(order);
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther("20")
      );
      expect(await collateral.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("20", await collateral.decimals())
      );
    });

    it("Should mint with aToken", async function () {
      const { collateral, acollateral, overlayerWrap, admin, alice } =
        await loadFixture(deployFixture);

      // aTokens are faked

      const contractAddr = await overlayerWrap.getAddress();
      const beforeBal = await collateral.balanceOf(contractAddr);

      const amount = "10";
      let order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await acollateral.getAddress(),
        collateralAmount: ethers.parseUnits(
          amount,
          await acollateral.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(order);
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther(amount)
      );
      expect(await acollateral.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits(amount, await acollateral.decimals())
      );
      // Initial leftover
      expect(await collateral.balanceOf(contractAddr)).to.equal(beforeBal);
    });

    it("Should not mint if blacklisted", async function () {
      const { collateral, overlayerWrap, alice, gatekeeper, bob } =
        await loadFixture(deployFixture);
      const blacklisterAddress = await gatekeeper.getAddress();
      await overlayerWrap.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        blacklisterAddress
      );
      // Test mint
      const amount = "10";
      const latestTime = await time.latest();
      await overlayerWrap.connect(gatekeeper).setBlackListTime(latestTime + 1);
      await time.increase(3600 * 24 * 15 + 1);
      await overlayerWrap
        .connect(gatekeeper)
        .disableAccount(await alice.getAddress());
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await collateral.getAddress(),
        collateralAmount: ethers.parseUnits(
          amount,
          await collateral.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await expect(overlayerWrap.connect(alice).mint(order)).to.be.eventually
        .rejected;

      await overlayerWrap
        .connect(gatekeeper)
        .enableAccount(await alice.getAddress());
      // Test transfer
      await overlayerWrap.connect(alice).mint(order);
      await overlayerWrap
        .connect(gatekeeper)
        .disableAccount(await alice.getAddress());
      await expect(
        overlayerWrap.connect(alice).transfer(await bob.getAddress(), "1")
      ).to.be.eventually.rejected;
      await overlayerWrap
        .connect(gatekeeper)
        .enableAccount(await alice.getAddress());
      await overlayerWrap
        .connect(gatekeeper)
        .disableAccount(await bob.getAddress());
      await expect(
        overlayerWrap.connect(alice).transfer(await bob.getAddress(), "1")
      ).to.be.eventually.rejected;
    });

    it("Should not mint oh behalf of external benefactors", async function () {
      const { collateral, overlayerWrap, bob, alice } = await loadFixture(
        deployFixture
      );
      const amount = "10";
      const order = {
        benefactor: bob.address,
        beneficiary: alice.address,
        collateral: await collateral.getAddress(),
        collateralAmount: ethers.parseUnits(
          amount,
          await collateral.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await expect(overlayerWrap.connect(alice).mint(order)).to.be.eventually
        .rejected;
    });

    it("Should mint small amount", async function () {
      const { collateral, overlayerWrap, alice } = await loadFixture(
        deployFixture
      );
      const amount = "0.000001";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await collateral.getAddress(),
        collateralAmount: ethers.parseUnits(
          amount,
          await collateral.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      const contractAddr = await overlayerWrap.getAddress();
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
      await overlayerWrap.connect(alice).mint(order);
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther(amount)
      );
      expect(await collateral.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits(amount, await collateral.decimals())
      );
    });

    it("Should not mint on unsufficient balance", async function () {
      const { collateral, overlayerWrap, alice } = await loadFixture(
        deployFixture
      );
      const amount = "50.00001";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await collateral.getAddress(),
        collateralAmount: ethers.parseUnits(
          amount,
          await collateral.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await expect(overlayerWrap.connect(alice).mint(order)).to.be.eventually
        .rejected;
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
    });
  });

  describe("Redeem", function () {
    it("Should redeem", async function () {
      const { collateral, overlayerWrap, alice } = await loadFixture(
        deployFixture
      );
      const amount = "20";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await collateral.getAddress(),
        collateralAmount: ethers.parseUnits(
          amount,
          await collateral.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(order);
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther(amount)
      );
      expect(
        await collateral.balanceOf(await overlayerWrap.getAddress())
      ).to.equal(ethers.parseUnits(amount, 6));
      expect(await overlayerWrap.connect(alice).redeem(order)).to.emit(
        overlayerWrap,
        "Transfer"
      );
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
      expect(
        await collateral.balanceOf(await overlayerWrap.getAddress())
      ).to.equal(ethers.parseUnits("0", await collateral.decimals()));
      expect(await collateral.balanceOf(alice.address)).to.equal(
        ethers.parseUnits("50", await collateral.decimals())
      );
    });

    it("Should redeem aToken", async function () {
      const { collateral, acollateral, overlayerWrap, admin, alice } =
        await loadFixture(deployFixture);

      // aTokens are faked

      const contractAddr = await overlayerWrap.getAddress();
      const beforeBal = await collateral.balanceOf(contractAddr);

      const amount = "10";

      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await acollateral.getAddress(),
        collateralAmount: ethers.parseUnits(
          amount,
          await acollateral.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(order);
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther(amount)
      );
      expect(await acollateral.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits(amount, await acollateral.decimals())
      );
      // Initial leftover
      expect(await collateral.balanceOf(contractAddr)).to.equal(beforeBal);

      await overlayerWrap.connect(alice).redeem(order);
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
      expect(await acollateral.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("0", await acollateral.decimals())
      );
      expect(await acollateral.balanceOf(alice.address)).to.equal(
        ethers.parseUnits("50", await acollateral.decimals()) // Initial value
      );
      // Initial leftover
      expect(await collateral.balanceOf(contractAddr)).to.equal(beforeBal);
    });

    it("Should not redeem not owned tokens", async function () {
      const { collateral, overlayerWrap, alice, bob, userAmount } =
        await loadFixture(deployFixture);
      const amount = "10";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await collateral.getAddress(),
        collateralAmount: ethers.parseUnits(
          amount,
          await collateral.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      const redeemOrder = {
        benefactor: alice.address,
        beneficiary: bob.address,
        collateral: await collateral.getAddress(),
        collateralAmount: ethers.parseUnits(
          amount,
          await collateral.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(order);
      await expect(overlayerWrap.connect(bob).redeem(redeemOrder)).to.be
        .eventually.rejected;
    });

    it("Should not redeem on low OverlayerWrap balance", async function () {
      const { overlayerWrap, collateral, alice, userAmount } =
        await loadFixture(deployFixture);
      const mintAmount = "10";
      const redeemAmount = "10.000001";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await collateral.getAddress(),
        collateralAmount: ethers.parseUnits(
          mintAmount,
          await collateral.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(mintAmount)
      };
      await overlayerWrap.connect(alice).mint(order);
      expect(await collateral.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits(
          (+userAmount - +mintAmount).toFixed(2),
          await collateral.decimals()
        )
      );
      const redeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await collateral.getAddress(),
        collateralAmount: ethers.parseUnits(
          redeemAmount,
          await collateral.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(redeemAmount)
      };
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther(mintAmount)
      );
      await expect(overlayerWrap.connect(alice).redeem(redeemOrder)).to.be
        .eventually.rejected;
      expect(await collateral.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits(
          (+userAmount - +mintAmount).toFixed(2),
          await collateral.decimals()
        )
      );
      expect(
        await collateral.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(ethers.parseUnits(mintAmount, await collateral.decimals()));
    });
  });
});
