import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { getContractAddress } from "@ethersproject/address";
import { LZ_ENDPOINT_ETH_MAINNET_V2 } from "../scripts/addresses";
import { HARDHAT_CHAIN_ID } from "../scripts/constants";
import { StakedOverlayerWrap_connectBacking } from "../scripts/functions";

/**
 * GHO / sGHO (ERC-4626) tests: OverlayerWrap mint/redeem + OverlayerWrapGhoBacking accounting.
 * Run: npx hardhat test test/GhoSghoHandler.ts --network hardhat
 */
describe("GhoSghoHandler", function () {
  describe("OverlayerWrap (GHO + sGHO vault)", function () {
    async function deployGhoFixture() {
      const [admin, , alice, bob] = await ethers.getSigners();

      const block = await admin.provider.getBlock("latest");
      const baseFee = block?.baseFeePerGas ?? 1n;
      const defaultTransactionOptions = {
        maxFeePerGas: baseFee * BigInt(10)
      };

      const Gho = await ethers.getContractFactory("MintableERC20");
      const gho = await Gho.deploy(
        10000,
        "GHO",
        "GHO",
        defaultTransactionOptions
      );
      await gho.waitForDeployment();

      const VaultFactory = await ethers.getContractFactory("MockSghoVault");
      const vault = await VaultFactory.deploy(
        await gho.getAddress(),
        defaultTransactionOptions
      );
      await vault.waitForDeployment();

      const ghoDecimals = await gho.decimals();
      const vaultDecimals = await vault.decimals();
      const excluded = await (
        await ethers.getContractFactory("GhoExcludedCollateral")
      ).deploy(defaultTransactionOptions);
      await excluded.waitForDeployment();

      const OverlayerWrap = await ethers.getContractFactory(
        "OverlayerWrapMock"
      );
      const overlayerWrap = await OverlayerWrap.deploy(
        {
          admin: await admin.getAddress(),
          lzEndpoint: LZ_ENDPOINT_ETH_MAINNET_V2,
          name: "O-GHO",
          symbol: "O+GHO",
          collateral: {
            addr: await gho.getAddress(),
            decimals: ghoDecimals
          },
          aCollateral: {
            addr: await excluded.getAddress(),
            decimals: 18
          },
          maxMintPerBlock: ethers.MaxUint256,
          maxRedeemPerBlock: ethers.MaxUint256,
          minValmaxRedeemPerBlock: 1n,
          hubChainId: HARDHAT_CHAIN_ID
        },
        defaultTransactionOptions
      );
      await overlayerWrap.waitForDeployment();

      const userAmount = "1000";
      const userAmt = ethers.parseUnits(userAmount, ghoDecimals);

      await gho.connect(admin).transfer(alice.address, userAmt);
      await gho.connect(admin).transfer(bob.address, userAmt);

      await gho
        .connect(alice)
        .approve(await vault.getAddress(), ethers.MaxUint256);
      await gho
        .connect(bob)
        .approve(await vault.getAddress(), ethers.MaxUint256);

      const depositAmt = ethers.parseUnits("500", ghoDecimals);
      await vault.connect(alice).deposit(depositAmt, alice.address);
      await vault.connect(bob).deposit(depositAmt, bob.address);

      await gho
        .connect(alice)
        .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);
      await gho
        .connect(bob)
        .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);
      await vault
        .connect(alice)
        .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);
      await vault
        .connect(bob)
        .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);

      return {
        gho,
        vault,
        overlayerWrap,
        admin,
        alice,
        bob,
        ghoDecimals,
        vaultDecimals
      };
    }

    it("Should mint and redeem with GHO collateral (18-dec alignment)", async function () {
      const { gho, overlayerWrap, alice, ghoDecimals } = await loadFixture(
        deployGhoFixture
      );

      const amount = "42";
      const collateralAmount = ethers.parseUnits(amount, ghoDecimals);
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount,
        overlayerWrapAmount: ethers.parseEther(amount)
      };

      await overlayerWrap.connect(alice).mint(order);
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        ethers.parseEther(amount)
      );

      await overlayerWrap.connect(alice).redeem(order);
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(0n);
    });

    it("Should reject minting with sGHO (vault) shares", async function () {
      const { vault, overlayerWrap, alice, vaultDecimals } = await loadFixture(
        deployGhoFixture
      );

      const amount = "10";
      const shareAmount = ethers.parseUnits(amount, vaultDecimals);
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await vault.getAddress(),
        collateralAmount: shareAmount,
        overlayerWrapAmount: ethers.parseEther(amount)
      };

      await expect(
        overlayerWrap.connect(alice).mint(order)
      ).to.be.revertedWithCustomError(
        overlayerWrap,
        "OverlayerWrapCoreCollateralNotValid"
      );
    });

    it("Should deploy OverlayerWrapGhoBacking wired to GHO + vault", async function () {
      const { gho, vault, overlayerWrap, admin } = await loadFixture(
        deployGhoFixture
      );

      const block = await admin.provider.getBlock("latest");
      const baseFee = block?.baseFeePerGas ?? 1n;
      const defaultTransactionOptions = {
        maxFeePerGas: baseFee * BigInt(10)
      };

      const Dispatcher = await ethers.getContractFactory("OvaDispatcher");
      const dispatcher = await Dispatcher.deploy(
        admin.address,
        admin.address,
        admin.address,
        admin.address,
        await overlayerWrap.getAddress(),
        defaultTransactionOptions
      );
      await dispatcher.waitForDeployment();

      const StakedOverlayerWrap = await ethers.getContractFactory(
        "StakedOverlayerWrap"
      );
      const sOverlayerWrap = await StakedOverlayerWrap.deploy(
        await overlayerWrap.getAddress(),
        admin.address,
        admin.address,
        defaultTransactionOptions
      );
      await sOverlayerWrap.waitForDeployment();

      const Backing = await ethers.getContractFactory(
        "OverlayerWrapGhoBacking"
      );
      const backing = await Backing.deploy(
        admin.address,
        await dispatcher.getAddress(),
        await overlayerWrap.getAddress(),
        await sOverlayerWrap.getAddress(),
        await gho.getAddress(),
        await vault.getAddress(),
        defaultTransactionOptions
      );
      await backing.waitForDeployment();

      expect(await backing.collateral()).to.equal(await gho.getAddress());
      expect(await backing.aCollateral()).to.equal(await vault.getAddress());
    });

    it("StakedOverlayerWrap_connectBacking sets overlayerWrapBacking on first setup", async function () {
      const { overlayerWrap, admin } = await loadFixture(deployGhoFixture);

      const sOverlayerWrap = await (
        await ethers.getContractFactory("StakedOverlayerWrap")
      ).deploy(
        await overlayerWrap.getAddress(),
        admin.address,
        admin.address
      );
      await sOverlayerWrap.waitForDeployment();

      expect(await sOverlayerWrap.overlayerWrapBacking()).to.equal(
        ethers.ZeroAddress
      );

      const backing = admin.address;
      await StakedOverlayerWrap_connectBacking(
        await sOverlayerWrap.getAddress(),
        backing,
        admin
      );

      expect(await sOverlayerWrap.overlayerWrapBacking()).to.equal(backing);

      await StakedOverlayerWrap_connectBacking(
        await sOverlayerWrap.getAddress(),
        backing,
        admin
      );
      expect(await sOverlayerWrap.overlayerWrapBacking()).to.equal(backing);
    });
  });

  describe("OverlayerWrapGhoBacking accounting", function () {
    async function deployBackingFixture() {
      const [admin, alice, bob] = await ethers.getSigners();
      const block = await admin.provider.getBlock("latest");
      const baseFee = block?.baseFeePerGas ?? 1n;
      const txOpts = { maxFeePerGas: baseFee * BigInt(10) };

      const gho = await (
        await ethers.getContractFactory("MintableERC20")
      ).deploy(10_000_000, "GHO", "GHO", txOpts);
      await gho.waitForDeployment();

      const vault = await (
        await ethers.getContractFactory("MockSghoVault")
      ).deploy(await gho.getAddress(), txOpts);
      await vault.waitForDeployment();

      const ghoDec = await gho.decimals();
      const vaultDec = await vault.decimals();
      const excluded = await (
        await ethers.getContractFactory("GhoExcludedCollateral")
      ).deploy(txOpts);
      await excluded.waitForDeployment();

      const OverlayerWrap = await ethers.getContractFactory(
        "OverlayerWrapMock"
      );
      const overlayerWrap = await OverlayerWrap.deploy(
        {
          admin: await admin.getAddress(),
          lzEndpoint: LZ_ENDPOINT_ETH_MAINNET_V2,
          name: "O-GHO",
          symbol: "O+GHO",
          collateral: { addr: await gho.getAddress(), decimals: ghoDec },
          aCollateral: { addr: await excluded.getAddress(), decimals: 18 },
          maxMintPerBlock: ethers.MaxUint256,
          maxRedeemPerBlock: ethers.MaxUint256,
          minValmaxRedeemPerBlock: 1n,
          hubChainId: HARDHAT_CHAIN_ID
        },
        txOpts
      );
      await overlayerWrap.waitForDeployment();

      const dispatcher = await (
        await ethers.getContractFactory("OvaDispatcher")
      ).deploy(
        admin.address,
        admin.address,
        admin.address,
        admin.address,
        await overlayerWrap.getAddress(),
        txOpts
      );
      await dispatcher.waitForDeployment();

      const sOverlayerWrap = await (
        await ethers.getContractFactory("StakedOverlayerWrap")
      ).deploy(
        await overlayerWrap.getAddress(),
        admin.address,
        admin.address,
        txOpts
      );
      await sOverlayerWrap.waitForDeployment();

      await overlayerWrap
        .connect(admin)
        .grantRole(
          ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
          admin.address
        );

      const backingNonce = Number(await admin.getNonce()) + 1;
      const futureBacking = getContractAddress({
        from: admin.address,
        nonce: backingNonce
      });
      await overlayerWrap
        .connect(admin)
        .proposeNewCollateralSpender(futureBacking);

      const backing = await (
        await ethers.getContractFactory("OverlayerWrapGhoBacking")
      ).deploy(
        admin.address,
        await dispatcher.getAddress(),
        await overlayerWrap.getAddress(),
        await sOverlayerWrap.getAddress(),
        await gho.getAddress(),
        await vault.getAddress(),
        txOpts
      );
      await backing.waitForDeployment();

      if ((await backing.getAddress()) !== futureBacking) {
        throw new Error("Backing address prediction mismatch");
      }

      await sOverlayerWrap
        .connect(admin)
        .proposeOverlayerWrapBacking(await backing.getAddress());
      await sOverlayerWrap.connect(admin).executeOverlayerWrapBackingChange();

      await sOverlayerWrap
        .connect(admin)
        .grantRole(
          ethers.keccak256(ethers.toUtf8Bytes("REWARDER_ROLE")),
          await backing.getAddress()
        );

      await gho
        .connect(admin)
        .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);
      const seedOrder = {
        benefactor: admin.address,
        beneficiary: admin.address,
        collateral: await gho.getAddress(),
        collateralAmount: ethers.parseEther("1"),
        overlayerWrapAmount: ethers.parseEther("1")
      };
      await overlayerWrap.connect(admin).mint(seedOrder);
      await overlayerWrap
        .connect(admin)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
      await sOverlayerWrap
        .connect(admin)
        .deposit(ethers.parseEther("1"), admin.address);

      await backing.connect(admin).acceptCollateralSpender();

      const fundUsers = ethers.parseEther("500000");
      await gho.connect(admin).transfer(alice.address, fundUsers);
      await gho.connect(admin).transfer(bob.address, fundUsers);
      await gho
        .connect(alice)
        .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);
      await gho
        .connect(bob)
        .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);
      await vault
        .connect(alice)
        .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);
      await vault
        .connect(bob)
        .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);
      await gho
        .connect(alice)
        .approve(await vault.getAddress(), ethers.MaxUint256);
      await gho
        .connect(bob)
        .approve(await vault.getAddress(), ethers.MaxUint256);

      async function backingVaultAssets() {
        const sh = await vault.balanceOf(await backing.getAddress());
        return vault.convertToAssets(sh);
      }

      return {
        admin,
        alice,
        bob,
        gho,
        vault,
        overlayerWrap,
        sOverlayerWrap,
        backing,
        ghoDec,
        vaultDec,
        txOpts,
        backingVaultAssets
      };
    }

    /** OW liability in collateral wei (matches handler when DECIMALS_DIFF_AMOUNT is 1 for 18/18). */
    async function owLiabilityWei(overlayerWrap: {
      totalSupply: () => Promise<bigint>;
      totalBridgedOut: () => Promise<bigint>;
    }) {
      return (
        (await overlayerWrap.totalSupply()) +
        (await overlayerWrap.totalBridgedOut())
      );
    }

    it("after GHO mint + supplyToBacking, totalSuppliedCollateral equals normalized OW liability (18/18)", async function () {
      const { gho, overlayerWrap, backing, alice } = await loadFixture(
        deployBackingFixture
      );

      const amt = ethers.parseEther("100");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: amt,
        overlayerWrapAmount: amt
      });

      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const liab = await owLiabilityWei(overlayerWrap);
      expect(await backing.totalSuppliedCollateral()).to.equal(liab);
    });

    it("wires StakedOverlayerWrap to the GHO backing before the seed deposit", async function () {
      const { sOverlayerWrap, backing } = await loadFixture(
        deployBackingFixture
      );

      expect(await sOverlayerWrap.overlayerWrapBacking()).to.equal(
        await backing.getAddress()
      );
      expect(await sOverlayerWrap.totalAssets()).to.equal(
        ethers.parseEther("1")
      );
    });

    it("new stake compounds backing yield before minting staking shares", async function () {
      const { gho, vault, overlayerWrap, sOverlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const mint = ethers.parseEther("50");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      await gho
        .connect(admin)
        .transfer(await vault.getAddress(), ethers.parseEther("25"));

      const owSupplyBefore = await overlayerWrap.totalSupply();
      await overlayerWrap
        .connect(alice)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
      await sOverlayerWrap
        .connect(alice)
        .deposit(ethers.parseEther("10"), alice.address);

      expect(await sOverlayerWrap.overlayerWrapBacking()).to.equal(
        await backing.getAddress()
      );
      expect(await overlayerWrap.totalSupply()).to.be.gt(owSupplyBefore);
    });

    it("staking deposit, mint, withdraw, and redeem revert when sGHO cannot pay pending yield", async function () {
      const { gho, vault, overlayerWrap, sOverlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const mint = ethers.parseEther("50");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);
      await overlayerWrap
        .connect(alice)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);

      const stake = ethers.parseEther("10");
      await sOverlayerWrap.connect(alice).deposit(stake, alice.address);
      const aliceShares = await sOverlayerWrap.balanceOf(alice.address);

      await gho
        .connect(admin)
        .transfer(await vault.getAddress(), ethers.parseEther("25"));
      await vault.setMaxWithdrawLimit(0n);

      await expect(
        sOverlayerWrap.connect(alice).deposit(stake, alice.address)
      ).to.be.revertedWithCustomError(
        backing,
        "GhoSghoHandlerPendingYieldNotWithdrawable"
      );
      await expect(
        sOverlayerWrap.connect(alice).mint(stake, alice.address)
      ).to.be.revertedWithCustomError(
        backing,
        "GhoSghoHandlerPendingYieldNotWithdrawable"
      );
      await expect(
        sOverlayerWrap
          .connect(alice)
          .withdraw(stake, alice.address, alice.address)
      ).to.be.revertedWithCustomError(
        backing,
        "GhoSghoHandlerPendingYieldNotWithdrawable"
      );
      await expect(
        sOverlayerWrap
          .connect(alice)
          .redeem(aliceShares, alice.address, alice.address)
      ).to.be.revertedWithCustomError(
        backing,
        "GhoSghoHandlerPendingYieldNotWithdrawable"
      );
    });

    it("ignores sGHO passed to supplyToBacking and leaves those shares on OverlayerWrap", async function () {
      const { gho, vault, overlayerWrap, backing, alice } = await loadFixture(
        deployBackingFixture
      );

      const mint = ethers.parseEther("100");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);
      const tsBefore = await backing.totalSuppliedCollateral();

      await vault
        .connect(alice)
        .deposit(ethers.parseEther("40"), alice.address);
      const shareBal = await vault.balanceOf(alice.address);
      await vault
        .connect(alice)
        .transfer(await overlayerWrap.getAddress(), shareBal);
      const backingShares = await vault.balanceOf(await backing.getAddress());

      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      expect(await vault.balanceOf(await overlayerWrap.getAddress())).to.equal(
        shareBal
      );
      expect(await vault.balanceOf(await backing.getAddress())).to.equal(
        backingShares
      );
      expect(await backing.totalSuppliedCollateral()).to.equal(tsBefore);
    });

    it("redeem GHO reduces totalSupplied by underlying amount withdrawn from backing", async function () {
      const { gho, overlayerWrap, backing, alice } = await loadFixture(
        deployBackingFixture
      );

      const mint = ethers.parseEther("80");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);
      const liab0 = await owLiabilityWei(overlayerWrap);
      expect(await backing.totalSuppliedCollateral()).to.equal(liab0);

      const redeem = ethers.parseEther("30");
      await overlayerWrap.connect(alice).redeem({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: redeem,
        overlayerWrapAmount: redeem
      });

      expect(await backing.totalSuppliedCollateral()).to.equal(liab0 - redeem);
    });

    it("rejects redeeming into sGHO shares when aCollateral is disabled", async function () {
      const { gho, vault, overlayerWrap, backing, alice } = await loadFixture(
        deployBackingFixture
      );

      const mint = ethers.parseEther("60");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const sh = ethers.parseEther("10");
      const ts = await backing.totalSuppliedCollateral();

      await expect(
        overlayerWrap.connect(alice).redeem({
          benefactor: alice.address,
          beneficiary: alice.address,
          collateral: await vault.getAddress(),
          collateralAmount: sh,
          overlayerWrapAmount: sh
        })
      ).to.be.revertedWithCustomError(
        overlayerWrap,
        "OverlayerWrapCoreCollateralNotValid"
      );

      expect(await backing.totalSuppliedCollateral()).to.equal(ts);
    });

    it("compound leaves totalSuppliedCollateral unchanged and moves yield out as GHO", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const mint = ethers.parseEther("50");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const ts = await backing.totalSuppliedCollateral();
      await gho
        .connect(admin)
        .transfer(await vault.getAddress(), ethers.parseEther("25"));

      const assetsBefore = await vault.convertToAssets(
        await vault.balanceOf(await backing.getAddress())
      );
      expect(assetsBefore).to.be.gt(ts);

      await backing.connect(admin).compound(false);

      expect(await backing.totalSuppliedCollateral()).to.equal(ts);
      expect(await gho.balanceOf(await backing.getAddress())).to.equal(0n);
    });

    it("compound reverts when sGHO yield is not withdrawable", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const mint = ethers.parseEther("50");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const ts = await backing.totalSuppliedCollateral();
      await gho
        .connect(admin)
        .transfer(await vault.getAddress(), ethers.parseEther("25"));
      expect(
        await vault.convertToAssets(
          await vault.balanceOf(await backing.getAddress())
        )
      ).to.be.gt(ts);

      await vault.setMaxWithdrawLimit(0n);

      await expect(
        backing.connect(admin).compound(false)
      ).to.be.revertedWithCustomError(
        backing,
        "GhoSghoHandlerPendingYieldNotWithdrawable"
      );
    });

    it("adminWithdraw returns principal as GHO so redeem and re-supply remain live", async function () {
      const { gho, overlayerWrap, backing, alice, admin } = await loadFixture(
        deployBackingFixture
      );

      const mint = ethers.parseEther("70");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);
      const liab0 = await owLiabilityWei(overlayerWrap);
      expect(await backing.totalSuppliedCollateral()).to.equal(liab0);

      await backing.connect(admin).adminWithdraw();

      expect(await backing.totalSuppliedCollateral()).to.equal(0n);
      const vault = await ethers.getContractAt(
        "MockSghoVault",
        await backing.aCollateral()
      );
      expect(await vault.balanceOf(await overlayerWrap.getAddress())).to.equal(
        0n
      );
      expect(await gho.balanceOf(await overlayerWrap.getAddress())).to.equal(
        liab0
      );

      const partialRedeem = ethers.parseEther("10");
      const aliceGhoBefore = await gho.balanceOf(alice.address);
      await overlayerWrap.connect(alice).redeem({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: partialRedeem,
        overlayerWrapAmount: partialRedeem
      });
      expect(await gho.balanceOf(alice.address)).to.equal(
        aliceGhoBefore + partialRedeem
      );

      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);
      expect(await backing.totalSuppliedCollateral()).to.equal(
        liab0 - partialRedeem
      );
      expect(await gho.balanceOf(await overlayerWrap.getAddress())).to.equal(
        0n
      );
    });

    it("invariant: totalSuppliedCollateral <= vault assets held by backing (after supply)", async function () {
      const { gho, overlayerWrap, backing, vault, alice, backingVaultAssets } =
        await loadFixture(deployBackingFixture);

      const mint = ethers.parseEther("90");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const ts = await backing.totalSuppliedCollateral();
      expect(ts).to.equal(await owLiabilityWei(overlayerWrap));
      const va = await backingVaultAssets();
      const liquid = await gho.balanceOf(await backing.getAddress());
      expect(va + liquid).to.be.gte(ts);
    });

    it("a direct sGHO donation does not block a later GHO supplyToBacking", async function () {
      const { gho, vault, overlayerWrap, backing, alice } = await loadFixture(
        deployBackingFixture
      );

      const mint = ethers.parseEther("40");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      await gho
        .connect(alice)
        .transfer(await vault.getAddress(), ethers.parseEther("500"));
      await vault
        .connect(alice)
        .deposit(ethers.parseEther("100"), alice.address);
      const donated = await vault.balanceOf(alice.address);
      await vault
        .connect(alice)
        .transfer(await overlayerWrap.getAddress(), donated);
      const backingShares = await vault.balanceOf(await backing.getAddress());

      const more = ethers.parseEther("25");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: more,
        overlayerWrapAmount: more
      });
      const tsBefore = await backing.totalSuppliedCollateral();
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      expect(await backing.totalSuppliedCollateral()).to.equal(tsBefore + more);
      expect(await gho.balanceOf(await overlayerWrap.getAddress())).to.equal(0n);
      expect(await vault.balanceOf(await overlayerWrap.getAddress())).to.equal(
        donated
      );
      const sharesFromNewGho =
        (await vault.balanceOf(await backing.getAddress())) - backingShares;
      expect(await vault.convertToAssets(sharesFromNewGho)).to.be.closeTo(
        more,
        ethers.parseEther("0.0001")
      );
    });

    it("keeps idle GHO until the configured buffer is filled, then deposits the excess into sGHO", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("50");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("40");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      // Seed 1 + 40 is still below the 50 buffer, so nothing goes to sGHO.
      const backingAddr = await backing.getAddress();
      expect(await gho.balanceOf(backingAddr)).to.equal(
        ethers.parseEther("41")
      );
      expect(await vault.balanceOf(backingAddr)).to.equal(0n);

      const secondMint = ethers.parseEther("30");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: secondMint,
        overlayerWrapAmount: secondMint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      expect(await gho.balanceOf(backingAddr)).to.equal(buffer);
      expect(
        await vault.convertToAssets(await vault.balanceOf(backingAddr))
      ).to.equal(ethers.parseEther("21"));
    });

    it("redeems from sGHO and leaves the idle buffer untouched", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("50");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("80");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      expect(await gho.balanceOf(backingAddr)).to.equal(buffer);

      const redeem = ethers.parseEther("20");
      const aliceGhoBefore = await gho.balanceOf(alice.address);
      await overlayerWrap.connect(alice).redeem({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: redeem,
        overlayerWrapAmount: redeem
      });

      expect(await gho.balanceOf(alice.address)).to.equal(
        aliceGhoBefore + redeem
      );
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        mint - redeem
      );
      expect(await gho.balanceOf(backingAddr)).to.equal(buffer);
    });

    it("redeems the shortfall from the idle reserve when sGHO cannot cover it", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("50");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("80");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);
      await vault.setMaxWithdrawLimit(0n);

      const backingAddr = await backing.getAddress();
      const aliceGhoBefore = await gho.balanceOf(alice.address);
      const redeem = ethers.parseEther("1");
      await overlayerWrap.connect(alice).redeem({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: redeem,
        overlayerWrapAmount: redeem
      });

      expect(await gho.balanceOf(alice.address)).to.equal(
        aliceGhoBefore + redeem
      );
      expect(await gho.balanceOf(backingAddr)).to.equal(buffer - redeem);

      await expect(
        overlayerWrap.connect(alice).redeem({
          benefactor: alice.address,
          beneficiary: alice.address,
          collateral: await gho.getAddress(),
          collateralAmount: buffer,
          overlayerWrapAmount: buffer
        })
      ).to.be.revertedWithCustomError(
        backing,
        "AaveHandlerInsufficientBalance"
      );
      expect(await gho.balanceOf(backingAddr)).to.equal(buffer - redeem);
    });

    it("compounds sGHO yield against vault principal only and does not treat idle GHO as yield", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("40");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("50");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      const liquid = await gho.balanceOf(backingAddr);
      expect(liquid).to.equal(buffer);

      const ts = await backing.totalSuppliedCollateral();
      const vaultPrincipal = ts - liquid;
      const vaultAssetsBefore = await vault.convertToAssets(
        await vault.balanceOf(backingAddr)
      );
      // Naive `convertToAssets(shares) vs totalSupplied` would skip: most principal is idle.
      expect(vaultAssetsBefore).to.be.lt(ts);
      expect(vaultAssetsBefore).to.be.closeTo(vaultPrincipal, 1n);

      const donatedYield = ethers.parseEther("8");
      await gho.connect(admin).transfer(await vault.getAddress(), donatedYield);

      const vaultAssetsAfterYield = await vault.convertToAssets(
        await vault.balanceOf(backingAddr)
      );
      expect(vaultAssetsAfterYield).to.be.gt(vaultPrincipal);

      const owSupplyBefore = await overlayerWrap.totalSupply();
      await backing.connect(admin).compound(false);

      expect(await gho.balanceOf(backingAddr)).to.equal(buffer);
      expect(await backing.totalSuppliedCollateral()).to.equal(ts);
      const minted = (await overlayerWrap.totalSupply()) - owSupplyBefore;
      expect(minted).to.be.gt(0n);
      expect(minted).to.be.closeTo(
        vaultAssetsAfterYield - vaultPrincipal,
        ethers.parseEther("0.0001")
      );
    });

    it("compounds a GHO donation to the handler as earnings without pulling sGHO principal", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("40");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("50");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      const donation = ethers.parseEther("20");
      await gho.connect(admin).transfer(backingAddr, donation);

      const sharesBefore = await vault.balanceOf(backingAddr);
      const owSupplyBefore = await overlayerWrap.totalSupply();
      const ts = await backing.totalSuppliedCollateral();

      await backing.connect(admin).compound(false);

      expect(await backing.totalSuppliedCollateral()).to.equal(ts);
      expect(await vault.balanceOf(backingAddr)).to.equal(sharesBefore);
      expect(await gho.balanceOf(backingAddr)).to.equal(buffer);
      expect(await overlayerWrap.totalSupply()).to.equal(
        owSupplyBefore + donation
      );
    });

    it("compound does not mint idle principal when the buffer is lowered before that GHO is deployed", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      await backing
        .connect(admin)
        .setLiquidReserveTarget(ethers.parseEther("80"));
      const mint = ethers.parseEther("40");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      const idle = await gho.balanceOf(backingAddr);
      const ts = await backing.totalSuppliedCollateral();
      expect(idle).to.equal(ts);
      expect(await vault.balanceOf(backingAddr)).to.equal(0n);

      await backing
        .connect(admin)
        .setLiquidReserveTarget(ethers.parseEther("10"));
      const owSupplyBefore = await overlayerWrap.totalSupply();
      await backing.connect(admin).compound(false);

      expect(await overlayerWrap.totalSupply()).to.equal(owSupplyBefore);
      expect(await gho.balanceOf(backingAddr)).to.equal(idle);
      expect(await backing.totalSuppliedCollateral()).to.equal(ts);
    });

    it("supply stays live when sGHO maxDeposit cannot take the excess, and compound does not mint that idle principal", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, overlayerWrap, backing, admin } = fx;
      const cap = ethers.parseEther("10");
      await vault.setMaxDepositLimit(cap);
      await mintAndSupply(fx, ethers.parseEther("50"));

      const backingAddr = await backing.getAddress();
      const ts = await backing.totalSuppliedCollateral();
      expect(ts).to.be.gt(cap);
      expect(
        await vault.convertToAssets(await vault.balanceOf(backingAddr))
      ).to.equal(cap);
      expect(await gho.balanceOf(backingAddr)).to.equal(ts - cap);

      const owSupplyBefore = await overlayerWrap.totalSupply();
      await backing.connect(admin).compound(false);
      expect(await overlayerWrap.totalSupply()).to.equal(owSupplyBefore);
      expect(await gho.balanceOf(backingAddr)).to.equal(ts - cap);

      await vault.setMaxDepositLimit(0n);
      await mintAndSupply(fx, ethers.parseEther("5"));
      expect(await backing.totalSuppliedCollateral()).to.equal(
        ts + ethers.parseEther("5")
      );
      expect(
        await vault.convertToAssets(await vault.balanceOf(backingAddr))
      ).to.equal(cap);
    });

    it("adminWithdraw sends idle plus vault principal to wrap and leftover yield shares to the dispatcher", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("50");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("80");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      const principal = await backing.totalSuppliedCollateral();
      const donatedYield = ethers.parseEther("25");
      await gho.connect(admin).transfer(await vault.getAddress(), donatedYield);

      const dispatcher = await backing.ovaRewardsDispatcher();
      await backing.connect(admin).adminWithdraw();

      expect(await backing.totalSuppliedCollateral()).to.equal(0n);
      expect(await gho.balanceOf(backingAddr)).to.equal(0n);
      expect(await vault.balanceOf(backingAddr)).to.equal(0n);
      expect(await gho.balanceOf(await overlayerWrap.getAddress())).to.equal(
        principal
      );
      const leftoverShares = await vault.balanceOf(dispatcher);
      expect(leftoverShares).to.be.gt(0n);
      expect(await vault.convertToAssets(leftoverShares)).to.be.closeTo(
        donatedYield,
        ethers.parseEther("0.0001")
      );
    });

    it("adminWithdraw reverts when sGHO cannot cover vault principal and leaves the buffer", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("50");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("80");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      const ts = await backing.totalSuppliedCollateral();
      await vault.setMaxWithdrawLimit(0n);

      await expect(
        backing.connect(admin).adminWithdraw()
      ).to.be.revertedWithCustomError(backing, "AaveHandlerInsufficientBalance");

      expect(await backing.totalSuppliedCollateral()).to.equal(ts);
      expect(await gho.balanceOf(backingAddr)).to.equal(buffer);
      expect(await gho.balanceOf(await overlayerWrap.getAddress())).to.equal(
        0n
      );
    });

    it("supply after a GHO donation deposits overflow above the buffer into sGHO", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("40");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("50");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      const vaultAssetsBefore = await vault.convertToAssets(
        await vault.balanceOf(backingAddr)
      );
      const ts = await backing.totalSuppliedCollateral();
      const donation = ethers.parseEther("20");
      await gho.connect(admin).transfer(backingAddr, donation);

      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      expect(await backing.totalSuppliedCollateral()).to.equal(ts);
      expect(await gho.balanceOf(backingAddr)).to.equal(buffer);
      expect(
        await vault.convertToAssets(await vault.balanceOf(backingAddr))
      ).to.equal(vaultAssetsBefore + donation);
    });

    it("rebalanceLiquidReserve deposits idle overflow into sGHO", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("40");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("50");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      const vaultAssetsBefore = await vault.convertToAssets(
        await vault.balanceOf(backingAddr)
      );
      const donation = ethers.parseEther("20");
      await gho.connect(admin).transfer(backingAddr, donation);

      await backing.connect(admin).rebalanceLiquidReserve();

      expect(await gho.balanceOf(backingAddr)).to.equal(buffer);
      expect(
        await vault.convertToAssets(await vault.balanceOf(backingAddr))
      ).to.equal(vaultAssetsBefore + donation);
    });

    it("rebalanceLiquidReserve refills the buffer from sGHO when the target is raised", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const initialBuffer = ethers.parseEther("20");
      await backing.connect(admin).setLiquidReserveTarget(initialBuffer);

      const mint = ethers.parseEther("80");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      const vaultAssetsBefore = await vault.convertToAssets(
        await vault.balanceOf(backingAddr)
      );
      const raisedBuffer = ethers.parseEther("50");
      await backing.connect(admin).setLiquidReserveTarget(raisedBuffer);
      await backing.connect(admin).rebalanceLiquidReserve();

      expect(await gho.balanceOf(backingAddr)).to.equal(raisedBuffer);
      expect(
        await vault.convertToAssets(await vault.balanceOf(backingAddr))
      ).to.equal(vaultAssetsBefore - (raisedBuffer - initialBuffer));
    });

    it("compound mints a handler donation plus sGHO yield together", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("40");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("50");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      const ts = await backing.totalSuppliedCollateral();
      const vaultPrincipal = ts - buffer;
      const donation = ethers.parseEther("20");
      const vaultYield = ethers.parseEther("8");
      await gho.connect(admin).transfer(backingAddr, donation);
      await gho.connect(admin).transfer(await vault.getAddress(), vaultYield);

      const vaultAssetsAfterYield = await vault.convertToAssets(
        await vault.balanceOf(backingAddr)
      );
      const owSupplyBefore = await overlayerWrap.totalSupply();
      await backing.connect(admin).compound(false);

      expect(await backing.totalSuppliedCollateral()).to.equal(ts);
      expect(await gho.balanceOf(backingAddr)).to.equal(buffer);
      const minted = (await overlayerWrap.totalSupply()) - owSupplyBefore;
      expect(minted).to.be.closeTo(
        donation + (vaultAssetsAfterYield - vaultPrincipal),
        ethers.parseEther("0.0001")
      );
    });

    it("compound reverts when sGHO cannot pay the yield that must come from the vault", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("40");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("50");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      await gho
        .connect(admin)
        .transfer(await vault.getAddress(), ethers.parseEther("8"));
      await vault.setMaxWithdrawLimit(ethers.parseEther("1"));

      await expect(
        backing.connect(admin).compound(false)
      ).to.be.revertedWithCustomError(
        backing,
        "GhoSghoHandlerPendingYieldNotWithdrawable"
      );
      expect(await gho.balanceOf(backingAddr)).to.equal(buffer);
    });

    it("compound is a no-op while the buffer is unfilled and there is no excess idle", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("50");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("40");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      const idle = await gho.balanceOf(backingAddr);
      expect(idle).to.be.lt(buffer);
      expect(await vault.balanceOf(backingAddr)).to.equal(0n);

      const ts = await backing.totalSuppliedCollateral();
      const owSupplyBefore = await overlayerWrap.totalSupply();
      await backing.connect(admin).compound(false);

      expect(await backing.totalSuppliedCollateral()).to.equal(ts);
      expect(await gho.balanceOf(backingAddr)).to.equal(idle);
      expect(await overlayerWrap.totalSupply()).to.equal(owSupplyBefore);
    });

    it("compound mints overflow idle when a donation fills an unfilled buffer (vaultPrincipal is 0)", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const buffer = ethers.parseEther("50");
      await backing.connect(admin).setLiquidReserveTarget(buffer);

      const mint = ethers.parseEther("40");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      const idleBefore = await gho.balanceOf(backingAddr);
      const donation = ethers.parseEther("20");
      await gho.connect(admin).transfer(backingAddr, donation);

      const ts = await backing.totalSuppliedCollateral();
      const owSupplyBefore = await overlayerWrap.totalSupply();
      await backing.connect(admin).compound(false);

      const surplus = idleBefore + donation - ts;
      expect(await backing.totalSuppliedCollateral()).to.equal(ts);
      expect(await vault.balanceOf(backingAddr)).to.equal(0n);
      expect(await gho.balanceOf(backingAddr)).to.equal(ts);
      expect(await overlayerWrap.totalSupply()).to.equal(
        owSupplyBefore + surplus
      );
    });

    it("compound mints a GHO donation as earnings when liquidReserveTarget is zero", async function () {
      const { gho, vault, overlayerWrap, backing, alice, admin } =
        await loadFixture(deployBackingFixture);

      const mint = ethers.parseEther("50");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

      const backingAddr = await backing.getAddress();
      expect(await backing.liquidReserveTarget()).to.equal(0n);
      expect(await gho.balanceOf(backingAddr)).to.equal(0n);

      const sharesBefore = await vault.balanceOf(backingAddr);
      const ts = await backing.totalSuppliedCollateral();
      const donation = ethers.parseEther("15");
      await gho.connect(admin).transfer(backingAddr, donation);

      const owSupplyBefore = await overlayerWrap.totalSupply();
      await backing.connect(admin).compound(false);

      expect(await backing.totalSuppliedCollateral()).to.equal(ts);
      expect(await vault.balanceOf(backingAddr)).to.equal(sharesBefore);
      expect(await gho.balanceOf(backingAddr)).to.equal(0n);
      expect(await overlayerWrap.totalSupply()).to.equal(
        owSupplyBefore + donation
      );
    });

    async function mintAndSupply(
      fx: {
        gho: { getAddress: () => Promise<string> };
        overlayerWrap: {
          connect: (signer: unknown) => {
            mint: (order: object) => Promise<unknown>;
            supplyToBacking: (a: bigint, b: bigint) => Promise<unknown>;
            approve: (spender: string, amount: bigint) => Promise<unknown>;
          };
        };
        alice: { address: string };
      },
      amount: bigint
    ) {
      await fx.overlayerWrap.connect(fx.alice).mint({
        benefactor: fx.alice.address,
        beneficiary: fx.alice.address,
        collateral: await fx.gho.getAddress(),
        collateralAmount: amount,
        overlayerWrapAmount: amount
      });
      await fx.overlayerWrap.connect(fx.alice).supplyToBacking(0n, 0n);
    }

    it("with no idle buffer, G+ redeem pays from sGHO and leaves the handler with no GHO", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, overlayerWrap, backing, alice } = fx;
      expect(await backing.liquidReserveTarget()).to.equal(0n);
      const mint = ethers.parseEther("80");
      await mintAndSupply(fx, mint);

      const backingAddr = await backing.getAddress();
      expect(await gho.balanceOf(backingAddr)).to.equal(0n);
      const aliceGhoBefore = await gho.balanceOf(alice.address);
      await overlayerWrap.connect(alice).redeem({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: mint,
        overlayerWrapAmount: mint
      });

      expect(await gho.balanceOf(alice.address)).to.equal(aliceGhoBefore + mint);
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(0n);
      expect(await gho.balanceOf(backingAddr)).to.equal(0n);
    });

    it("with no idle buffer, G+ redeem reverts when sGHO cannot return any GHO", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, overlayerWrap, backing, alice } = fx;
      const mint = ethers.parseEther("80");
      await mintAndSupply(fx, mint);
      await vault.setMaxWithdrawLimit(0n);

      const backingAddr = await backing.getAddress();
      const ts = await backing.totalSuppliedCollateral();
      const aliceGhoBefore = await gho.balanceOf(alice.address);
      const aliceOwBefore = await overlayerWrap.balanceOf(alice.address);
      await expect(
        overlayerWrap.connect(alice).redeem({
          benefactor: alice.address,
          beneficiary: alice.address,
          collateral: await gho.getAddress(),
          collateralAmount: ethers.parseEther("1"),
          overlayerWrapAmount: ethers.parseEther("1")
        })
      ).to.be.revertedWithCustomError(
        backing,
        "AaveHandlerInsufficientBalance"
      );

      expect(await gho.balanceOf(backingAddr)).to.equal(0n);
      expect(await gho.balanceOf(alice.address)).to.equal(aliceGhoBefore);
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        aliceOwBefore
      );
      expect(await backing.totalSuppliedCollateral()).to.equal(ts);
    });

    it("with no idle buffer, G+ redeem stops at what sGHO can pay immediately", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, overlayerWrap, backing, alice } = fx;
      const mint = ethers.parseEther("80");
      await mintAndSupply(fx, mint);
      const available = ethers.parseEther("25");
      await vault.setMaxWithdrawLimit(available);

      const backingAddr = await backing.getAddress();
      const ts = await backing.totalSuppliedCollateral();
      const aliceGhoBefore = await gho.balanceOf(alice.address);
      await expect(
        overlayerWrap.connect(alice).redeem({
          benefactor: alice.address,
          beneficiary: alice.address,
          collateral: await gho.getAddress(),
          collateralAmount: mint,
          overlayerWrapAmount: mint
        })
      ).to.be.revertedWithCustomError(
        backing,
        "AaveHandlerInsufficientBalance"
      );
      await overlayerWrap.connect(alice).redeem({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: available,
        overlayerWrapAmount: available
      });

      expect(await gho.balanceOf(alice.address)).to.equal(
        aliceGhoBefore + available
      );
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        mint - available
      );
      expect(await gho.balanceOf(backingAddr)).to.equal(0n);
      expect(await backing.totalSuppliedCollateral()).to.equal(ts - available);
    });

    it("with no idle buffer, adminWithdraw reverts unless sGHO can return the full principal", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, overlayerWrap, backing, admin } = fx;
      await mintAndSupply(fx, ethers.parseEther("80"));
      const backingAddr = await backing.getAddress();
      const principal = await backing.totalSuppliedCollateral();
      const sharesBefore = await vault.balanceOf(backingAddr);

      await vault.setMaxWithdrawLimit(ethers.parseEther("25"));
      await expect(
        backing.connect(admin).adminWithdraw()
      ).to.be.revertedWithCustomError(backing, "AaveHandlerInsufficientBalance");

      await vault.setMaxWithdrawLimit(0n);
      await expect(
        backing.connect(admin).adminWithdraw()
      ).to.be.revertedWithCustomError(backing, "AaveHandlerInsufficientBalance");

      expect(await backing.totalSuppliedCollateral()).to.equal(principal);
      expect(await gho.balanceOf(backingAddr)).to.equal(0n);
      expect(await gho.balanceOf(await overlayerWrap.getAddress())).to.equal(0n);
      expect(await vault.balanceOf(backingAddr)).to.equal(sharesBefore);
    });

    it("with no idle buffer, sG+ can exit to O-GHO while sGHO cannot pay GHO, and G+ redeem then reverts", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, overlayerWrap, sOverlayerWrap, backing, alice } = fx;
      const mint = ethers.parseEther("80");
      await mintAndSupply(fx, mint);
      await overlayerWrap
        .connect(alice)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
      const stake = ethers.parseEther("30");
      await sOverlayerWrap.connect(alice).deposit(stake, alice.address);
      const shares = await sOverlayerWrap.balanceOf(alice.address);

      await vault.setMaxWithdrawLimit(0n);
      const supplyBefore = await overlayerWrap.totalSupply();
      const owBefore = await overlayerWrap.balanceOf(alice.address);
      await sOverlayerWrap
        .connect(alice)
        .redeem(shares, alice.address, alice.address);

      expect(await sOverlayerWrap.balanceOf(alice.address)).to.equal(0n);
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        owBefore + stake
      );
      expect(await overlayerWrap.totalSupply()).to.equal(supplyBefore);
      expect(await gho.balanceOf(await backing.getAddress())).to.equal(0n);

      await expect(
        overlayerWrap.connect(alice).redeem({
          benefactor: alice.address,
          beneficiary: alice.address,
          collateral: await gho.getAddress(),
          collateralAmount: stake,
          overlayerWrapAmount: stake
        })
      ).to.be.revertedWithCustomError(
        backing,
        "AaveHandlerInsufficientBalance"
      );
      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        owBefore + stake
      );
    });

    it("with no idle buffer, sG+ entry and exit revert when sGHO yield exists but no GHO can be withdrawn", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, overlayerWrap, sOverlayerWrap, backing, alice, admin } =
        fx;
      await mintAndSupply(fx, ethers.parseEther("80"));
      await overlayerWrap
        .connect(alice)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
      const stake = ethers.parseEther("20");
      await sOverlayerWrap.connect(alice).deposit(stake, alice.address);
      const shares = await sOverlayerWrap.balanceOf(alice.address);
      await ghoYield(gho, vault, admin, ethers.parseEther("10"));
      await vault.setMaxWithdrawLimit(0n);

      const backingAddr = await backing.getAddress();
      const supplyBefore = await overlayerWrap.totalSupply();
      await expect(
        backing.connect(admin).compound(false)
      ).to.be.revertedWithCustomError(
        backing,
        "GhoSghoHandlerPendingYieldNotWithdrawable"
      );
      for (const call of [
        sOverlayerWrap.connect(alice).deposit(stake, alice.address),
        sOverlayerWrap.connect(alice).mint(ethers.parseEther("1"), alice.address),
        sOverlayerWrap
          .connect(alice)
          .withdraw(stake, alice.address, alice.address),
        sOverlayerWrap
          .connect(alice)
          .redeem(shares, alice.address, alice.address)
      ]) {
        await expect(call).to.be.revertedWithCustomError(
          backing,
          "GhoSghoHandlerPendingYieldNotWithdrawable"
        );
      }

      expect(await gho.balanceOf(backingAddr)).to.equal(0n);
      expect(await overlayerWrap.totalSupply()).to.equal(supplyBefore);
      expect(await sOverlayerWrap.balanceOf(alice.address)).to.equal(shares);
    });

    it("sG+ mint harvests payable sGHO yield before issuing shares", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { vault, overlayerWrap, sOverlayerWrap, alice, admin } = fx;
      await mintAndSupply(fx, ethers.parseEther("50"));
      await ghoYield(fx.gho, vault, admin, ethers.parseEther("10"));

      await overlayerWrap
        .connect(alice)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
      const shares = ethers.parseEther("5");
      const supplyBefore = await overlayerWrap.totalSupply();
      await sOverlayerWrap.connect(alice).mint(shares, alice.address);

      expect(await sOverlayerWrap.balanceOf(alice.address)).to.equal(shares);
      expect(await overlayerWrap.totalSupply()).to.be.gt(supplyBefore);
    });

    it("sG+ withdraw harvests payable sGHO yield and returns the requested O-GHO", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { vault, overlayerWrap, sOverlayerWrap, alice, admin } = fx;
      await mintAndSupply(fx, ethers.parseEther("50"));
      await overlayerWrap
        .connect(alice)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
      const stake = ethers.parseEther("10");
      await sOverlayerWrap.connect(alice).deposit(stake, alice.address);
      await ghoYield(fx.gho, vault, admin, ethers.parseEther("10"));

      const owBefore = await overlayerWrap.balanceOf(alice.address);
      const supplyBefore = await overlayerWrap.totalSupply();
      await sOverlayerWrap
        .connect(alice)
        .withdraw(stake, alice.address, alice.address);

      expect(await overlayerWrap.balanceOf(alice.address)).to.equal(
        owBefore + stake
      );
      expect(await overlayerWrap.totalSupply()).to.be.gt(supplyBefore);
      expect(await sOverlayerWrap.balanceOf(alice.address)).to.be.gt(0n);
    });

    it("sG+ redeem harvests payable sGHO yield and returns more O-GHO than was staked", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { vault, overlayerWrap, sOverlayerWrap, alice, admin } = fx;
      await mintAndSupply(fx, ethers.parseEther("50"));
      await overlayerWrap
        .connect(alice)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
      const stake = ethers.parseEther("10");
      await sOverlayerWrap.connect(alice).deposit(stake, alice.address);
      await ghoYield(fx.gho, vault, admin, ethers.parseEther("10"));

      const shares = await sOverlayerWrap.balanceOf(alice.address);
      const owBefore = await overlayerWrap.balanceOf(alice.address);
      const supplyBefore = await overlayerWrap.totalSupply();
      await sOverlayerWrap
        .connect(alice)
        .redeem(shares, alice.address, alice.address);

      expect(await sOverlayerWrap.balanceOf(alice.address)).to.equal(0n);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.gt(
        owBefore + stake
      );
      expect(await overlayerWrap.totalSupply()).to.be.gt(supplyBefore);
    });

    it("sG+ deposit with a filled buffer harvests vault yield and leaves idle GHO", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, overlayerWrap, sOverlayerWrap, backing, alice, admin } =
        fx;
      const buffer = ethers.parseEther("40");
      await backing.connect(admin).setLiquidReserveTarget(buffer);
      await mintAndSupply(fx, ethers.parseEther("50"));
      await ghoYield(gho, vault, admin, ethers.parseEther("8"));

      const backingAddr = await backing.getAddress();
      expect(await gho.balanceOf(backingAddr)).to.equal(buffer);
      await overlayerWrap
        .connect(alice)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
      const supplyBefore = await overlayerWrap.totalSupply();
      await sOverlayerWrap
        .connect(alice)
        .deposit(ethers.parseEther("10"), alice.address);

      expect(await gho.balanceOf(backingAddr)).to.equal(buffer);
      expect(await sOverlayerWrap.balanceOf(alice.address)).to.be.gt(0n);
      expect(await overlayerWrap.totalSupply()).to.be.gt(supplyBefore);
    });

    it("sG+ deposit, mint, withdraw, and redeem revert when buffered sGHO yield is not payable", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, overlayerWrap, sOverlayerWrap, backing, alice, admin } =
        fx;
      const buffer = ethers.parseEther("40");
      await backing.connect(admin).setLiquidReserveTarget(buffer);
      await mintAndSupply(fx, ethers.parseEther("50"));
      await overlayerWrap
        .connect(alice)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
      const stake = ethers.parseEther("10");
      await sOverlayerWrap.connect(alice).deposit(stake, alice.address);
      const shares = await sOverlayerWrap.balanceOf(alice.address);

      await ghoYield(gho, vault, admin, ethers.parseEther("8"));
      await vault.setMaxWithdrawLimit(0n);

      const backingAddr = await backing.getAddress();
      const supplyBefore = await overlayerWrap.totalSupply();
      const idleBefore = await gho.balanceOf(backingAddr);

      for (const call of [
        sOverlayerWrap.connect(alice).deposit(stake, alice.address),
        sOverlayerWrap.connect(alice).mint(stake, alice.address),
        sOverlayerWrap
          .connect(alice)
          .withdraw(stake, alice.address, alice.address),
        sOverlayerWrap
          .connect(alice)
          .redeem(shares, alice.address, alice.address)
      ]) {
        await expect(call).to.be.revertedWithCustomError(
          backing,
          "GhoSghoHandlerPendingYieldNotWithdrawable"
        );
      }

      expect(await sOverlayerWrap.balanceOf(alice.address)).to.equal(shares);
      expect(await overlayerWrap.totalSupply()).to.equal(supplyBefore);
      expect(await gho.balanceOf(backingAddr)).to.equal(idleBefore);
    });

    it("sG+ calls revert when sGHO can pay only part of the pending yield", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { vault, overlayerWrap, sOverlayerWrap, backing, alice, admin } =
        fx;
      await mintAndSupply(fx, ethers.parseEther("50"));
      await overlayerWrap
        .connect(alice)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
      const stake = ethers.parseEther("10");
      await sOverlayerWrap.connect(alice).deposit(stake, alice.address);

      await ghoYield(fx.gho, vault, admin, ethers.parseEther("10"));
      await vault.setMaxWithdrawLimit(ethers.parseEther("1"));

      const shares = await sOverlayerWrap.balanceOf(alice.address);
      const supplyBefore = await overlayerWrap.totalSupply();
      await expect(
        sOverlayerWrap.connect(alice).deposit(stake, alice.address)
      ).to.be.revertedWithCustomError(
        backing,
        "GhoSghoHandlerPendingYieldNotWithdrawable"
      );
      await expect(
        sOverlayerWrap
          .connect(alice)
          .redeem(shares, alice.address, alice.address)
      ).to.be.revertedWithCustomError(
        backing,
        "GhoSghoHandlerPendingYieldNotWithdrawable"
      );
      expect(await overlayerWrap.totalSupply()).to.equal(supplyBefore);
      expect(await sOverlayerWrap.balanceOf(alice.address)).to.equal(shares);
    });

    it("sG+ deposit harvests again after sGHO liquidity is restored", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { vault, overlayerWrap, sOverlayerWrap, backing, alice, admin } =
        fx;
      await mintAndSupply(fx, ethers.parseEther("50"));
      await ghoYield(fx.gho, vault, admin, ethers.parseEther("10"));
      await vault.setMaxWithdrawLimit(0n);
      await overlayerWrap
        .connect(alice)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
      await expect(
        sOverlayerWrap
          .connect(alice)
          .deposit(ethers.parseEther("10"), alice.address)
      ).to.be.revertedWithCustomError(
        backing,
        "GhoSghoHandlerPendingYieldNotWithdrawable"
      );

      await vault.setMaxWithdrawLimit(ethers.MaxUint256);
      const supplyBefore = await overlayerWrap.totalSupply();
      await sOverlayerWrap
        .connect(alice)
        .deposit(ethers.parseEther("10"), alice.address);
      expect(await sOverlayerWrap.balanceOf(alice.address)).to.be.gt(0n);
      expect(await overlayerWrap.totalSupply()).to.be.gt(supplyBefore);
    });

    it("G+ redeem uses idle GHO when sGHO holds no principal", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, overlayerWrap, backing, alice, admin } = fx;
      const buffer = ethers.parseEther("100");
      await backing.connect(admin).setLiquidReserveTarget(buffer);
      await mintAndSupply(fx, ethers.parseEther("40"));

      const backingAddr = await backing.getAddress();
      const idle = await gho.balanceOf(backingAddr);
      expect(idle).to.be.lt(buffer);
      expect(await vault.balanceOf(backingAddr)).to.equal(0n);

      const redeem = ethers.parseEther("1");
      const aliceGhoBefore = await gho.balanceOf(alice.address);
      await overlayerWrap.connect(alice).redeem({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: redeem,
        overlayerWrapAmount: redeem
      });
      expect(await gho.balanceOf(alice.address)).to.equal(
        aliceGhoBefore + redeem
      );
      expect(await gho.balanceOf(backingAddr)).to.equal(idle - redeem);
    });

    it("G+ redeem takes the sGHO shortfall from the idle reserve", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, overlayerWrap, backing, alice, admin } = fx;
      const buffer = ethers.parseEther("40");
      await backing.connect(admin).setLiquidReserveTarget(buffer);
      await mintAndSupply(fx, ethers.parseEther("50"));
      const backingAddr = await backing.getAddress();
      const available = ethers.parseEther("5");
      await vault.setMaxWithdrawLimit(available);

      const redeem = ethers.parseEther("10");
      const aliceGhoBefore = await gho.balanceOf(alice.address);
      await overlayerWrap.connect(alice).redeem({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: redeem,
        overlayerWrapAmount: redeem
      });
      expect(await gho.balanceOf(alice.address)).to.equal(
        aliceGhoBefore + redeem
      );
      expect(await gho.balanceOf(backingAddr)).to.equal(buffer - (redeem - available));
    });

    it("adminWithdraw returns idle principal when nothing has been deposited in sGHO", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, overlayerWrap, backing, admin } = fx;
      await backing
        .connect(admin)
        .setLiquidReserveTarget(ethers.parseEther("100"));
      await mintAndSupply(fx, ethers.parseEther("40"));

      const backingAddr = await backing.getAddress();
      const principal = await backing.totalSuppliedCollateral();
      expect(await vault.balanceOf(backingAddr)).to.equal(0n);
      const dispatcher = await backing.ovaRewardsDispatcher();

      await backing.connect(admin).adminWithdraw();

      expect(await backing.totalSuppliedCollateral()).to.equal(0n);
      expect(await gho.balanceOf(await overlayerWrap.getAddress())).to.equal(
        principal
      );
      expect(await gho.balanceOf(backingAddr)).to.equal(0n);
      expect(await vault.balanceOf(dispatcher)).to.equal(0n);
    });

    it("compound pays the staking vault 80% and the dispatcher 20% of withdrawable yield", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { vault, overlayerWrap, sOverlayerWrap, backing, admin } = fx;
      await mintAndSupply(fx, ethers.parseEther("50"));
      await ghoYield(fx.gho, vault, admin, ethers.parseEther("10"));

      const supplyBefore = await overlayerWrap.totalSupply();
      const stakingBefore = await sOverlayerWrap.totalAssets();
      const adminBefore = await overlayerWrap.balanceOf(admin.address);
      await backing.connect(admin).compound(true);

      const minted = (await overlayerWrap.totalSupply()) - supplyBefore;
      expect(minted).to.be.gt(0n);
      expect(
        (await sOverlayerWrap.totalAssets()) - stakingBefore
      ).to.be.closeTo((minted * 80n) / 100n, 2n);
      expect(
        (await overlayerWrap.balanceOf(admin.address)) - adminBefore
      ).to.be.closeTo(minted - (minted * 80n) / 100n, 2n);
    });

    it("compound succeeds when maxWithdraw covers the full sGHO position", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { vault, overlayerWrap, backing, admin } = fx;
      await mintAndSupply(fx, ethers.parseEther("50"));
      await ghoYield(fx.gho, vault, admin, ethers.parseEther("10"));
      const backingAddr = await backing.getAddress();
      const assets = await vault.convertToAssets(
        await vault.balanceOf(backingAddr)
      );
      await vault.setMaxWithdrawLimit(assets);

      const supplyBefore = await overlayerWrap.totalSupply();
      await backing.connect(admin).compound(false);
      expect(await overlayerWrap.totalSupply()).to.be.gt(supplyBefore);
    });

    it("rebalanceLiquidReserve pulls only what sGHO can pay toward a higher target", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, backing, admin } = fx;
      await backing
        .connect(admin)
        .setLiquidReserveTarget(ethers.parseEther("20"));
      await mintAndSupply(fx, ethers.parseEther("80"));

      const backingAddr = await backing.getAddress();
      const vaultBefore = await vault.convertToAssets(
        await vault.balanceOf(backingAddr)
      );
      const pull = ethers.parseEther("10");
      await vault.setMaxWithdrawLimit(pull);
      await backing
        .connect(admin)
        .setLiquidReserveTarget(ethers.parseEther("50"));
      await backing.connect(admin).rebalanceLiquidReserve();

      expect(await gho.balanceOf(backingAddr)).to.equal(
        ethers.parseEther("30")
      );
      expect(
        await vault.convertToAssets(await vault.balanceOf(backingAddr))
      ).to.equal(vaultBefore - pull);
    });

    it("rebalanceLiquidReserve leaves balances unchanged when sGHO cannot refill the buffer", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, backing, admin } = fx;
      await backing
        .connect(admin)
        .setLiquidReserveTarget(ethers.parseEther("20"));
      await mintAndSupply(fx, ethers.parseEther("80"));
      const backingAddr = await backing.getAddress();
      const sharesBefore = await vault.balanceOf(backingAddr);
      await vault.setMaxWithdrawLimit(0n);
      await backing
        .connect(admin)
        .setLiquidReserveTarget(ethers.parseEther("50"));
      await backing.connect(admin).rebalanceLiquidReserve();

      expect(await gho.balanceOf(backingAddr)).to.equal(
        ethers.parseEther("20")
      );
      expect(await vault.balanceOf(backingAddr)).to.equal(sharesBefore);
    });

    it("accepts a dispatcher allocation after the delay and compounds at the new split", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { vault, overlayerWrap, sOverlayerWrap, backing, alice, admin } =
        fx;
      await expect(
        backing.connect(admin).acceptProposedOvaDispatcherAllocation()
      ).to.be.revertedWithCustomError(backing, "GhoSghoHandlerNoProposal");
      await expect(
        backing.connect(admin).proposeNewOvaDispatcherAllocation(101)
      ).to.be.revertedWithCustomError(backing, "AaveHandlerOperationNotAllowed");
      await expect(
        backing.connect(alice).proposeNewOvaDispatcherAllocation(50)
      ).to.be.revertedWithCustomError(backing, "OwnableUnauthorizedAccount");

      await backing.connect(admin).proposeNewOvaDispatcherAllocation(50);
      await expect(
        backing.connect(admin).acceptProposedOvaDispatcherAllocation()
      ).to.be.revertedWithCustomError(backing, "AaveIntervalNotRespected");

      await time.increase(10 * 24 * 60 * 60 + 1);
      await backing.connect(admin).acceptProposedOvaDispatcherAllocation();
      expect(await backing.ovaDispatcherAllocation()).to.equal(50);
      expect(await backing.stakedOverlayerWrapRewardsAllocation()).to.equal(50);

      await mintAndSupply(fx, ethers.parseEther("50"));
      await ghoYield(fx.gho, vault, admin, ethers.parseEther("10"));
      const supplyBefore = await overlayerWrap.totalSupply();
      const stakingBefore = await sOverlayerWrap.totalAssets();
      await backing.connect(admin).compound(false);
      const minted = (await overlayerWrap.totalSupply()) - supplyBefore;
      expect(
        (await sOverlayerWrap.totalAssets()) - stakingBefore
      ).to.be.closeTo(minted / 2n, 2n);
    });

    it("updateRewardsDispatcher sends the dispatcher share to the new dispatcher", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { vault, overlayerWrap, backing, bob, admin } = fx;
      await expect(
        backing.connect(admin).updateRewardsDispatcher(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(
        backing,
        "AaveHandlerZeroAddressException"
      );

      const block = await admin.provider.getBlock("latest");
      const txOpts = { maxFeePerGas: (block?.baseFeePerGas ?? 1n) * 10n };
      const dispatcher = await (
        await ethers.getContractFactory("OvaDispatcher")
      ).deploy(
        admin.address,
        bob.address,
        bob.address,
        bob.address,
        await overlayerWrap.getAddress(),
        txOpts
      );
      await backing
        .connect(admin)
        .updateRewardsDispatcher(await dispatcher.getAddress());

      await mintAndSupply(fx, ethers.parseEther("50"));
      await ghoYield(fx.gho, vault, admin, ethers.parseEther("10"));
      const bobBefore = await overlayerWrap.balanceOf(bob.address);
      const supplyBefore = await overlayerWrap.totalSupply();
      await backing.connect(admin).compound(false);
      const minted = (await overlayerWrap.totalSupply()) - supplyBefore;
      expect(
        (await overlayerWrap.balanceOf(bob.address)) - bobBefore
      ).to.be.closeTo(minted - (minted * 80n) / 100n, 2n);
    });

    it("clearing the sGHO allowance blocks the next deposit until it is restored", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, overlayerWrap, backing, alice, admin } = fx;
      await mintAndSupply(fx, ethers.parseEther("20"));
      await backing.connect(admin).approveVault(0n);

      const more = ethers.parseEther("10");
      await overlayerWrap.connect(alice).mint({
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await gho.getAddress(),
        collateralAmount: more,
        overlayerWrapAmount: more
      });
      await expect(
        overlayerWrap.connect(alice).supplyToBacking(0n, 0n)
      ).to.be.reverted;

      await backing.connect(admin).approveVault(ethers.MaxUint256);
      await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);
      expect(await backing.totalSuppliedCollateral()).to.be.gt(
        ethers.parseEther("20")
      );
    });

    it("clearing the staking allowance blocks compound until it is restored", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { vault, overlayerWrap, backing, admin } = fx;
      await mintAndSupply(fx, ethers.parseEther("50"));
      await ghoYield(fx.gho, vault, admin, ethers.parseEther("10"));
      await backing.connect(admin).approveStakingOverlayerWrap(0n);

      await expect(backing.connect(admin).compound(false)).to.be.reverted;
      await backing
        .connect(admin)
        .approveStakingOverlayerWrap(ethers.MaxUint256);
      const supplyBefore = await overlayerWrap.totalSupply();
      await backing.connect(admin).compound(false);
      expect(await overlayerWrap.totalSupply()).to.be.gt(supplyBefore);
    });

    it("clearing the wrap allowance blocks compound until it is restored", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, vault, overlayerWrap, backing, admin } = fx;
      await mintAndSupply(fx, ethers.parseEther("50"));
      await ghoYield(fx.gho, vault, admin, ethers.parseEther("10"));
      await backing.connect(admin).approveOverlayerWrap(0n);

      await expect(backing.connect(admin).compound(false)).to.be.reverted;
      await backing.connect(admin).approveOverlayerWrap(ethers.MaxUint256);
      const supplyBefore = await overlayerWrap.totalSupply();
      await backing.connect(admin).compound(false);
      expect(await overlayerWrap.totalSupply()).to.be.gt(supplyBefore);
      expect(await gho.balanceOf(await backing.getAddress())).to.equal(0n);
    });

    it("rejects ownership renounce and calls that are not owner or OverlayerWrap", async function () {
      const fx = await loadFixture(deployBackingFixture);
      const { gho, backing, alice } = fx;
      await expect(
        backing.connect(fx.admin).renounceOwnership()
      ).to.be.revertedWithCustomError(
        backing,
        "AaveHandlerCantRenounceOwnership"
      );
      await expect(
        backing.connect(alice).adminWithdraw()
      ).to.be.revertedWithCustomError(backing, "OwnableUnauthorizedAccount");
      await expect(
        backing.connect(alice).setLiquidReserveTarget(1n)
      ).to.be.revertedWithCustomError(backing, "OwnableUnauthorizedAccount");
      await expect(
        backing.connect(alice).rebalanceLiquidReserve()
      ).to.be.revertedWithCustomError(backing, "OwnableUnauthorizedAccount");
      await expect(
        backing.connect(alice).supply(1n, await gho.getAddress())
      ).to.be.revertedWithCustomError(
        backing,
        "AaveHandlerCallerIsNotOverlayerWrap"
      );
      await expect(
        backing.connect(alice).withdraw(1n, await gho.getAddress())
      ).to.be.revertedWithCustomError(
        backing,
        "AaveHandlerCallerIsNotOverlayerWrap"
      );
    });

    it("rejects a backing constructed with a zero address, the same wrap and staking token, or a vault of another asset", async function () {
      const { admin, overlayerWrap, sOverlayerWrap, gho, vault } =
        await loadFixture(deployBackingFixture);
      const Backing = await ethers.getContractFactory("OverlayerWrapGhoBacking");
      const wrap = await overlayerWrap.getAddress();
      const staking = await sOverlayerWrap.getAddress();
      const ghoAddr = await gho.getAddress();
      const vaultAddr = await vault.getAddress();
      const block = await admin.provider.getBlock("latest");
      const txOpts = { maxFeePerGas: (block?.baseFeePerGas ?? 1n) * 10n };

      await expect(
        Backing.deploy(
          ethers.ZeroAddress,
          admin.address,
          wrap,
          staking,
          ghoAddr,
          vaultAddr,
          txOpts
        )
      ).to.be.revertedWithCustomError(Backing, "OwnableInvalidOwner");

      await expect(
        Backing.deploy(
          admin.address,
          ethers.ZeroAddress,
          wrap,
          staking,
          ghoAddr,
          vaultAddr,
          txOpts
        )
      ).to.be.revertedWithCustomError(
        Backing,
        "AaveHandlerZeroAddressException"
      );

      await expect(
        Backing.deploy(
          admin.address,
          admin.address,
          wrap,
          wrap,
          ghoAddr,
          vaultAddr,
          txOpts
        )
      ).to.be.revertedWithCustomError(Backing, "AaveHandlerSameAddressException");

      const other = await (
        await ethers.getContractFactory("MintableERC20")
      ).deploy(1_000, "OTHER", "OTHER", txOpts);
      const otherVault = await (
        await ethers.getContractFactory("MockSghoVault")
      ).deploy(await other.getAddress(), txOpts);
      await expect(
        Backing.deploy(
          admin.address,
          admin.address,
          wrap,
          staking,
          ghoAddr,
          await otherVault.getAddress(),
          txOpts
        )
      ).to.be.revertedWithCustomError(Backing, "AaveHandlerInvalidCollateral");
    });
  });
});

async function ghoYield(
  gho: {
    connect: (signer: unknown) => {
      transfer: (to: string, amount: bigint) => Promise<unknown>;
    };
  },
  vault: { getAddress: () => Promise<string> },
  admin: unknown,
  amount: bigint
) {
  await gho.connect(admin).transfer(await vault.getAddress(), amount);
}
