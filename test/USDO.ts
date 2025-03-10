import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("USDO", function () {
  async function deployFixture() {
    const [admin, gatekeeper, alice, bob] = await ethers.getSigners();

    const block = await admin.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(10)
    };

    const Usdc = await ethers.getContractFactory("SixDecimalsUsd");
    const usdc = await Usdc.deploy(
      1000,
      "USDC",
      "USDC",
      defaultTransactionOptions
    );
    const aUsdc = await ethers.getContractFactory("SixDecimalsUsd");
    const ausdc = await aUsdc.deploy(
      1000,
      "aUSDC",
      "aUSDC",
      defaultTransactionOptions
    );

    const Usdt = await ethers.getContractFactory("SixDecimalsUsd");
    const usdt = await Usdt.deploy(
      1000,
      "USDT",
      "USDT",
      defaultTransactionOptions
    );
    const aUsdt = await ethers.getContractFactory("SixDecimalsUsd");
    const ausdt = await aUsdt.deploy(
      1000,
      "aUSDT",
      "aUSDT",
      defaultTransactionOptions
    );

    const Contract = await ethers.getContractFactory("USDO");
    const usdo = await Contract.deploy(
      await admin.getAddress(),
      {
        addr: await usdc.getAddress(),
        decimals: await usdc.decimals()
      },
      {
        addr: await usdt.getAddress(),
        decimals: await usdt.decimals()
      },
      {
        addr: await ausdc.getAddress(),
        decimals: 6
      },
      {
        addr: await ausdt.getAddress(),
        decimals: 6
      },
      ethers.parseEther("100000000"),
      ethers.parseEther("100000000"),
      defaultTransactionOptions
    );

    //send some usdc and usdt to users
    await usdc
      .connect(admin)
      .transfer(alice.address, ethers.parseUnits("50", await usdc.decimals()));
    await ausdc
      .connect(admin)
      .transfer(alice.address, ethers.parseUnits("50", await usdc.decimals()));
    await usdc
      .connect(admin)
      .transfer(bob.address, ethers.parseUnits("50", await usdc.decimals()));
    await usdt
      .connect(admin)
      .transfer(alice.address, ethers.parseUnits("50", await usdt.decimals()));
    await ausdt
      .connect(admin)
      .transfer(alice.address, ethers.parseUnits("50", await usdt.decimals()));
    await usdt
      .connect(admin)
      .transfer(bob.address, ethers.parseUnits("50", await usdt.decimals()));

    await usdc
      .connect(alice)
      .approve(
        await usdo.getAddress(),
        ethers.parseUnits("50", await usdc.decimals())
      );
    await usdc
      .connect(bob)
      .approve(
        await usdo.getAddress(),
        ethers.parseUnits("50", await usdc.decimals())
      );
    await usdt
      .connect(alice)
      .approve(
        await usdo.getAddress(),
        ethers.parseUnits("50", await usdt.decimals())
      );
    await usdt
      .connect(bob)
      .approve(
        await usdo.getAddress(),
        ethers.parseUnits("50", await usdt.decimals())
      );

    //prepare contract for withdrawals
    await usdc
      .connect(admin)
      .transfer(await usdo.getAddress(), ethers.parseUnits("100", 6));
    await usdt
      .connect(admin)
      .transfer(await usdo.getAddress(), ethers.parseUnits("100", 6));

    return { ausdc, ausdt, usdc, usdt, usdo, admin, gatekeeper, alice, bob };
  }

  describe("Deployment", function () {
    it("Should set the admin", async function () {
      const { usdo, admin } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      expect(await usdo.owner()).to.equal(adminAddress);
    });
  });

  describe("Deployment", function () {
    it("Should pause", async function () {
      const { usdo, admin, usdt, usdc } = await loadFixture(deployFixture);
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        admin.address
      );
      await usdo.connect(admin).pause();
      expect(await usdo.paused()).to.equal(true);
      await expect(usdo.connect(admin).supplyToBacking(0, 0)).to.be.eventually
        .rejected;
    });

    it("Should unpause", async function () {
      const { usdo, admin } = await loadFixture(deployFixture);
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        admin.address
      );
      await usdo.connect(admin).pause();
      expect(await usdo.paused()).to.equal(true);
      await usdo.connect(admin).unpause();
      expect(await usdo.paused()).to.equal(false);
    });
  });

  describe("USDOCollateral Manager", function () {
    it("Should set first collateral manager", async function () {
      const { usdo, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(await usdo.getSpender()).to.be.equal(ethers.ZeroAddress);
      await usdo.connect(admin).proposeNewCollateralSpender(alice.address);
      expect(await usdo.proposedSpender()).to.be.equal(alice.address);
      await usdo.connect(alice).acceptProposedCollateralSpender();
      expect(await usdo.getSpender()).to.be.equal(alice.address);
    });

    it("Should reject acceptance if not the proposed spender", async function () {
      const { usdo, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(await usdo.getSpender()).to.be.equal(ethers.ZeroAddress);
      await usdo.connect(admin).proposeNewCollateralSpender(alice.address);
      expect(await usdo.proposedSpender()).to.be.equal(alice.address);
      await expect(usdo.connect(admin).acceptProposedCollateralSpender()).to.be
        .eventually.rejected;
    });

    it("Should not propose spender if not allowed", async function () {
      const { usdo, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      await expect(
        usdo.connect(alice).proposeNewCollateralSpender(alice.address)
      ).to.be.eventually.rejected;
    });

    it("Should set next collateral manager", async function () {
      const { usdo, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(await usdo.getSpender()).to.be.equal(ethers.ZeroAddress);
      await usdo.connect(admin).proposeNewCollateralSpender(alice.address);
      expect(await usdo.proposedSpender()).to.be.equal(alice.address);
      await usdo.connect(alice).acceptProposedCollateralSpender();
      expect(await usdo.getSpender()).to.be.equal(alice.address);

      //change from alice spender to admin
      await usdo.connect(admin).proposeNewCollateralSpender(admin.address);
      expect(await usdo.proposedSpender()).to.be.equal(admin.address);
      const oldTime = await time.latest();
      expect(await usdo.proposalTime()).to.be.equal(oldTime);

      await time.increase(10 * 24 * 60 * 60);

      await usdo.connect(admin).acceptProposedCollateralSpender();
      expect(await usdo.getSpender()).to.be.equal(admin.address);
    });

    it("Should not set next collateral manager if time not respected", async function () {
      const { usdo, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(await usdo.getSpender()).to.be.equal(ethers.ZeroAddress);
      await usdo.connect(admin).proposeNewCollateralSpender(alice.address);
      expect(await usdo.proposedSpender()).to.be.equal(alice.address);
      await usdo.connect(alice).acceptProposedCollateralSpender();
      expect(await usdo.getSpender()).to.be.equal(alice.address);

      //change from alice spender to admin
      await usdo.connect(admin).proposeNewCollateralSpender(admin.address);
      expect(await usdo.proposedSpender()).to.be.equal(admin.address);
      const oldTime = await time.latest();
      expect(await usdo.proposalTime()).to.be.equal(oldTime);

      await time.increase(10 * 24 * 60 * 59);

      await expect(usdo.connect(admin).acceptProposedCollateralSpender()).to.be
        .eventually.rejected;
    });
  });

  describe("Roles", function () {
    it("Should set the collateral manager", async function () {
      const { usdo, admin, alice } = await loadFixture(deployFixture);
      const collateralManagerAddress = await admin.getAddress();
      const aliceAddress = await alice.getAddress();
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        collateralManagerAddress
      );
      expect(
        await usdo.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
          collateralManagerAddress
        )
      ).to.equal(true);
      expect(
        await usdo.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
          aliceAddress
        )
      ).to.equal(false);
    });

    it("Should set the gatekeeper", async function () {
      const { usdo, gatekeeper, alice } = await loadFixture(deployFixture);
      const gatekeeperAddress = await gatekeeper.getAddress();
      const aliceAddress = await alice.getAddress();
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        gatekeeperAddress
      );
      expect(
        await usdo.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
          gatekeeperAddress
        )
      ).to.equal(true);
      expect(
        await usdo.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
          aliceAddress
        )
      ).to.equal(false);
    });

    it("Should set blacklister", async function () {
      const { usdo, gatekeeper, alice, bob } = await loadFixture(deployFixture);
      const blacklisterAddress = await gatekeeper.getAddress();
      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        blacklisterAddress
      );
      expect(
        await usdo.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
          blacklisterAddress
        )
      ).to.equal(true);
      expect(
        await usdo.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
          aliceAddress
        )
      ).to.equal(false);

      await expect(usdo.connect(alice).disableAccount(blacklisterAddress)).to.be
        .eventually.rejected;

      await usdo.connect(gatekeeper).disableAccount(bobAddress);
      expect(await usdo.blacklist(bobAddress)).to.be.equal(true);

      await usdo.connect(gatekeeper).enableAccount(bobAddress);
      expect(await usdo.blacklist(bobAddress)).to.be.equal(false);
    });
  });

  describe("Mint Redeem Per Block", function () {
    it("Should set initial values", async function () {
      const { usdo } = await loadFixture(deployFixture);
      expect(await usdo.maxMintPerBlock()).to.equal(
        ethers.parseEther("100000000")
      );
      expect(await usdo.maxRedeemPerBlock()).to.equal(
        ethers.parseEther("100000000")
      );
    });

    it("Should change values", async function () {
      const { usdo, admin, gatekeeper } = await loadFixture(deployFixture);
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        await gatekeeper.getAddress()
      );
      await expect(
        usdo
          .connect(gatekeeper)
          .setMaxMintPerBlock(ethers.parseEther("90000000"))
      ).to.be.eventually.rejected;
      await expect(
        usdo
          .connect(gatekeeper)
          .setMaxRedeemPerBlock(ethers.parseEther("90000000"))
      ).to.be.eventually.rejected;
      await usdo
        .connect(admin)
        .setMaxMintPerBlock(ethers.parseEther("90000000"));
      await usdo
        .connect(admin)
        .setMaxRedeemPerBlock(ethers.parseEther("90000000"));
      expect(await usdo.maxMintPerBlock()).to.equal(
        ethers.parseEther("90000000")
      );
      expect(await usdo.maxRedeemPerBlock()).to.equal(
        ethers.parseEther("90000000")
      );
    });

    it("Should stop mint", async function () {
      const { usdo, admin, gatekeeper } = await loadFixture(deployFixture);
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("GATEKEEPER_ROLE")),
        await gatekeeper.getAddress()
      );
      await expect(usdo.connect(admin).disableMint()).to.be.eventually.rejected;
      await usdo.connect(gatekeeper).disableMint();
      expect(await usdo.maxMintPerBlock()).to.equal(ethers.parseEther("0"));
    });

    it("Should set emergency mode", async function () {
      const { usdo, admin } = await loadFixture(deployFixture);
      expect(await usdo.connect(admin).setEmergencyStatus(true)).to.emit(
        usdo,
        "MintRedeemManagerEmergencyStatus"
      );
    });
  });

  describe("Mint", function () {
    it("Should mint", async function () {
      const { usdc, usdt, usdo, admin, alice } = await loadFixture(
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
      const contractAddr = await usdo.getAddress();
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
      await usdo.connect(alice).mint(order);
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("20")
      );
      expect(await usdt.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("110", await usdt.decimals())
      );
      expect(await usdc.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("110", await usdc.decimals())
      );
    });

    it("Should mint in emergency mode", async function () {
      const { usdc, ausdc, ausdt, usdt, usdo, admin, alice } =
        await loadFixture(deployFixture);

      // aTokens are faked

      const contractAddr = await usdo.getAddress();
      const beforeBalUsdc = await usdc.balanceOf(contractAddr);
      const beforeBalUsdt = await usdt.balanceOf(contractAddr);

      const amount = "10";
      await usdo.connect(admin).setEmergencyStatus(true);
      let order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await ausdt.getAddress(),
        collateral_usdc: await ausdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits(
          amount,
          await ausdt.decimals()
        ),
        collateral_usdc_amount: ethers.parseUnits(
          amount,
          await ausdt.decimals()
        ),
        usdo_amount: ethers.parseEther((+amount * 2).toFixed(0))
      };
      await expect(usdo.connect(alice).mint(order)).to.be.eventually.rejected;

      await ausdc.connect(alice).approve(contractAddr, ethers.MaxUint256);
      await ausdt.connect(alice).approve(contractAddr, ethers.MaxUint256);
      order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await ausdt.getAddress(),
        collateral_usdc: await ausdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits(
          amount,
          await ausdt.decimals()
        ),
        collateral_usdc_amount: ethers.parseUnits(
          amount,
          await ausdt.decimals()
        ),
        usdo_amount: ethers.parseEther((+amount * 2).toFixed(0))
      };
      await usdo.connect(alice).mint(order);
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("20")
      );
      expect(await ausdc.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits(amount, await ausdc.decimals())
      );
      expect(await ausdt.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits(amount, await ausdt.decimals())
      );
      // Initial leftover
      expect(await usdc.balanceOf(contractAddr)).to.equal(beforeBalUsdc);
      expect(await usdt.balanceOf(contractAddr)).to.equal(beforeBalUsdt);
    });

    it("Should not mint if blacklisted", async function () {
      const { usdc, usdt, usdo, admin, alice, gatekeeper, bob } =
        await loadFixture(deployFixture);
      const blacklisterAddress = await gatekeeper.getAddress();
      await usdo.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE")),
        blacklisterAddress
      );
      // Test mint
      await usdo.connect(gatekeeper).disableAccount(await alice.getAddress());
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits("10", await usdt.decimals()),
        collateral_usdc_amount: ethers.parseUnits("10", await usdc.decimals()),
        usdo_amount: ethers.parseEther("20")
      };
      await expect(usdo.connect(alice).mint(order)).to.be.eventually.rejected;

      await usdo.connect(gatekeeper).enableAccount(await alice.getAddress());
      // Test transfer
      await usdo.connect(alice).mint(order);
      await usdo.connect(gatekeeper).disableAccount(await bob.getAddress());
      await expect(usdo.connect(alice).transfer(await bob.getAddress(), "1")).to
        .be.eventually.rejected;
    });

    it("Should not mint oh behalf of external benefactors", async function () {
      const { usdc, usdt, usdo, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      const order = {
        benefactor: bob.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits("10", await usdt.decimals()),
        collateral_usdc_amount: ethers.parseUnits("10", await usdc.decimals()),
        usdo_amount: ethers.parseEther("20")
      };
      await expect(usdo.connect(alice).mint(order)).to.be.eventually.rejected;
    });

    it("Should mint small amount", async function () {
      const { usdc, usdt, usdo, admin, alice } = await loadFixture(
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
      const contractAddr = await usdo.getAddress();
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
      await usdo.connect(alice).mint(order);
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("2")
      );
      expect(await usdt.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("101", await usdt.decimals())
      );
      expect(await usdc.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("101", await usdc.decimals())
      );
    });

    it("Should mint too small amount", async function () {
      const { admin, usdc, usdt, usdo, alice } = await loadFixture(
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
      const contractAddr = await usdo.getAddress();
      await expect(usdo.connect(alice).mint(order)).to.not.be.eventually
        .rejected;
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther((0.9999 * 2).toString())
      );
      expect(await usdt.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("100.9999", await usdt.decimals())
      );
      expect(await usdc.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("100.9999", await usdc.decimals())
      );
    });

    it("Should not mint on wrong ratio", async function () {
      const { usdc, usdt, usdo, alice } = await loadFixture(deployFixture);
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
      await expect(usdo.connect(alice).mint(order)).to.be.eventually.rejected;
      expect(await usdo.balanceOf(alice.address)).to.equal(
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
      await expect(usdo.connect(alice).mint(order)).to.be.eventually.rejected;
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
    });

    it("Should not mint on unsufficient balance", async function () {
      const { usdc, usdt, usdo, alice } = await loadFixture(deployFixture);
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
      await expect(usdo.connect(alice).mint(order)).to.be.eventually.rejected;
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
    });
  });

  describe("Redeem", function () {
    it("Should redeem", async function () {
      const { usdc, usdt, usdo, admin, alice } = await loadFixture(
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
      await usdo.connect(alice).mint(order);
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("20")
      );
      expect(await usdc.balanceOf(await usdo.getAddress())).to.equal(
        ethers.parseUnits("110", 6)
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.equal(
        ethers.parseUnits("110", 6)
      );
      expect(await usdo.connect(alice).redeem(order)).to.emit(usdo, "Transfer");
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.equal(
        ethers.parseUnits("100", await usdt.decimals())
      );
      expect(await usdc.balanceOf(await usdo.getAddress())).to.equal(
        ethers.parseUnits("100", await usdc.decimals())
      );
      expect(await usdt.balanceOf(alice.address)).to.equal(
        ethers.parseUnits("50", await usdt.decimals())
      );
      expect(await usdc.balanceOf(alice.address)).to.equal(
        ethers.parseUnits("50", await usdc.decimals())
      );
    });

    it("Should redeem in emergency mode", async function () {
      const { usdc, ausdc, ausdt, usdt, usdo, admin, alice } =
        await loadFixture(deployFixture);

      // aTokens are faked

      const contractAddr = await usdo.getAddress();
      const beforeBalUsdc = await usdc.balanceOf(contractAddr);
      const beforeBalUsdt = await usdt.balanceOf(contractAddr);

      const amount = "10";
      await usdo.connect(admin).setEmergencyStatus(true);

      await ausdc.connect(alice).approve(contractAddr, ethers.MaxUint256);
      await ausdt.connect(alice).approve(contractAddr, ethers.MaxUint256);
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await ausdt.getAddress(),
        collateral_usdc: await ausdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits(
          amount,
          await ausdt.decimals()
        ),
        collateral_usdc_amount: ethers.parseUnits(
          amount,
          await ausdt.decimals()
        ),
        usdo_amount: ethers.parseEther((+amount * 2).toFixed(0))
      };
      await usdo.connect(alice).mint(order);
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("20")
      );
      expect(await ausdc.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits(amount, await ausdc.decimals())
      );
      expect(await ausdt.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits(amount, await ausdt.decimals())
      );
      // Initial leftover
      expect(await usdc.balanceOf(contractAddr)).to.equal(beforeBalUsdc);
      expect(await usdt.balanceOf(contractAddr)).to.equal(beforeBalUsdt);

      await usdo.connect(alice).redeem(order);
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("0")
      );
      expect(await ausdc.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("0", await ausdc.decimals())
      );
      expect(await ausdt.balanceOf(contractAddr)).to.equal(
        ethers.parseUnits("0", await ausdt.decimals())
      );
      expect(await ausdc.balanceOf(alice.address)).to.equal(
        ethers.parseUnits("50", await ausdc.decimals()) // Initial value
      );
      expect(await ausdt.balanceOf(alice.address)).to.equal(
        ethers.parseUnits("50", await ausdt.decimals()) // Initial value
      );
      // Initial leftover
      expect(await usdc.balanceOf(contractAddr)).to.equal(beforeBalUsdc);
      expect(await usdt.balanceOf(contractAddr)).to.equal(beforeBalUsdt);
    });

    it("Should not redeem not owned tokens", async function () {
      const { usdc, usdt, usdo, admin, alice, bob } = await loadFixture(
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
      const redeemOrder = {
        benefactor: alice.address,
        beneficiary: bob.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits("10", await usdt.decimals()),
        collateral_usdc_amount: ethers.parseUnits("10", await usdc.decimals()),
        usdo_amount: ethers.parseEther("20")
      };
      await usdo.connect(alice).mint(order);
      await expect(usdo.connect(bob).redeem(redeemOrder)).to.be.eventually
        .rejected;
    });

    it("Should not redeem on low USDO balance", async function () {
      const { usdc, usdt, usdo, admin, alice } = await loadFixture(
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
      await usdo.connect(alice).mint(order);
      expect(await usdc.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits("40", await usdc.decimals())
      );
      expect(await usdt.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits("40", await usdt.decimals())
      );
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
      expect(await usdo.balanceOf(alice.address)).to.equal(
        ethers.parseEther("20")
      );
      await expect(usdo.connect(alice).redeem(redeemOrder)).to.be.eventually
        .rejected;
      expect(await usdc.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits("40", await usdc.decimals())
      );
      expect(await usdt.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits("40", await usdt.decimals())
      );
      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("110", await usdc.decimals())
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("110", await usdt.decimals())
      );
    });
  });
});
