import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { config, ethers, network } from "hardhat";
import { expect } from "chai";
import { getContractAddress } from "@ethersproject/address";
import {
  AUSDT_ADDRESS,
  USDT_ADDRESS,
  AWETH_ADDRESS,
  AAVE_POOL_V3_ADDRESS,
  LZ_ENDPOINT_ETH_MAINNET_V2
} from "../scripts/addresses";
import ERC20_ABI from "./ERC20_ABI.json";
import { swap } from "../scripts/uniswap_swapper/proxy";
import { Contract } from "ethers";
import Big from "big.js";
import OVERLAYER_WRAP_ABI from "../artifacts/contracts/overlayer/OverlayerWrap.sol/OverlayerWrap.json";
import { AAVE_POOL_V3_ABI } from "../scripts/abi/AAVE_POOL_V3";
import { HARDHAT_CHAIN_ID } from "../scripts/constants";

let swapped = false;

//NOTE: this test works only on ETH mainnet (0x1)
describe("OverlayerWrap Backing Protocol", function () {
  async function deployFixture() {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: config.networks.hardhat.forking?.url,
            blockNumber: config.networks.hardhat.forking?.blockNumber
          }
        }
      ]
    });
    if (!swapped) {
      //get usdt and usdt
      await swap("75", "25");
      swapped = true;
    }

    const [admin, gatekeeper, alice, bob] = await ethers.getSigners();

    const block = await admin.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(10)
    };

    const stableAmount = 10000;

    const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, admin.provider);
    const ausdt = new ethers.Contract(AUSDT_ADDRESS, ERC20_ABI, admin.provider);
    const aweth = new ethers.Contract(AWETH_ADDRESS, ERC20_ABI, admin.provider);
    const aaveV3 = new ethers.Contract(
      AAVE_POOL_V3_ADDRESS,
      AAVE_POOL_V3_ABI,
      admin.provider
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
        maxRedeemPerBlock: ethers.MaxUint256,
        hubChainId: HARDHAT_CHAIN_ID
      },
      defaultTransactionOptions
    );
    await overlayerWrap.waitForDeployment();

    const Dispatcher = await ethers.getContractFactory("OvaDispatcher");
    const dispatcher = await Dispatcher.deploy(
      admin.address,
      admin.address,
      admin.address,
      admin.address,
      await overlayerWrap.getAddress(),
      defaultTransactionOptions
    );

    //send some usdc and usdt to users
    await (usdt.connect(admin) as Contract).transfer(
      alice.address,
      ethers.parseUnits((stableAmount / 2).toString(), await usdt.decimals())
    );
    await (usdt.connect(admin) as Contract).transfer(
      bob.address,
      ethers.parseUnits((stableAmount / 2).toString(), await usdt.decimals())
    );

    await (usdt.connect(alice) as Contract).approve(
      await overlayerWrap.getAddress(),
      ethers.MaxUint256
    );
    await (usdt.connect(bob) as Contract).approve(
      await overlayerWrap.getAddress(),
      ethers.MaxUint256
    );

    const StakedOverlayerWrap = await ethers.getContractFactory(
      "StakedOverlayerWrap"
    );
    const sOverlayerWrap = await StakedOverlayerWrap.deploy(
      await overlayerWrap.getAddress(),
      admin.address,
      admin.address,
      0
    );

    await sOverlayerWrap.connect(admin).setCooldownDuration(0); // 0 days

    await overlayerWrap
      .connect(admin)
      .grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        admin.address
      );
    const OverlayerWrapBackingNonce = (await admin.getNonce()) + 1;
    const futureAddress = getContractAddress({
      from: admin.address,
      nonce: OverlayerWrapBackingNonce
    });
    await overlayerWrap
      .connect(admin)
      .proposeNewCollateralSpender(futureAddress);

    const OverlayerWrapBacking = await ethers.getContractFactory(
      "OverlayerWrapBacking"
    );
    const overlayerWrapBacking = await OverlayerWrapBacking.deploy(
      admin.address,
      await dispatcher.getAddress(),
      await overlayerWrap.getAddress(),
      await sOverlayerWrap.getAddress(),
      defaultTransactionOptions
    );

    await sOverlayerWrap
      .connect(admin)
      .setOverlayerWrapBacking(await overlayerWrapBacking.getAddress());

    // Grant rewarder role
    await sOverlayerWrap
      .connect(admin)
      .grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("REWARDER_ROLE")),
        await overlayerWrapBacking.getAddress()
      );

    const initialCollateralAmount = "1";

    const order = {
      benefactor: admin.address,
      beneficiary: admin.address,
      collateral: await usdt.getAddress(),
      collateralAmount: ethers.parseUnits(
        initialCollateralAmount,
        await usdt.decimals()
      ),
      overlayerWrapAmount: ethers.parseEther(initialCollateralAmount)
    };
    await (usdt.connect(admin) as Contract).approve(
      await overlayerWrap.getAddress(),
      ethers.MaxUint256
    );
    await overlayerWrap.connect(admin).mint(order);
    await overlayerWrap
      .connect(admin)
      .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);

    //stake initial amount to avoid donation attack on staking contract
    await sOverlayerWrap
      .connect(admin)
      .deposit(ethers.parseEther("1"), admin.address);

    if (futureAddress !== (await overlayerWrapBacking.getAddress())) {
      throw new Error(
        "The predicted OverlayerWrapBacking address is not valid"
      );
    }

    await overlayerWrapBacking.connect(admin).acceptCollateralSpender();

    return {
      usdt,
      ausdt,
      aaveV3,
      aweth,
      overlayerWrap,
      sOverlayerWrap,
      overlayerWrapBacking,
      admin,
      gatekeeper,
      alice,
      bob,
      dispatcher,
      initialCollateralAmount
    };
  }

  describe("Contract Initialization", function () {
    it("Should properly assign administrative roles", async function () {
      const { overlayerWrapBacking, admin } = await loadFixture(deployFixture);
      expect(await overlayerWrapBacking.owner()).to.equal(admin.address);
    });

    it("Should correctly configure initial collateral spender", async function () {
      const { overlayerWrapBacking, overlayerWrap } = await loadFixture(
        deployFixture
      );
      expect(await overlayerWrap.getSpender()).to.equal(
        await overlayerWrapBacking.getAddress()
      );
    });
  });

  describe("AAVE Integration Management", function () {
    it("Should update AAVE protocol contract address", async function () {
      const { overlayerWrapBacking, admin } = await loadFixture(deployFixture);
      await overlayerWrapBacking.proposeNewAave(admin.address);
      await time.increase(10 * 24 * 60 * 60);
      expect(
        await overlayerWrapBacking.connect(admin).acceptProposedAave()
      ).to.emit(overlayerWrapBacking, "AaveNewAaave");
    });
  });

  describe("Team Allocation Management", function () {
    it("Should modify team reward allocation parameters", async function () {
      const { overlayerWrapBacking, admin } = await loadFixture(deployFixture);
      await overlayerWrapBacking.proposeNewOvaDispatcherAllocation(10);
      await time.increase(10 * 24 * 60 * 60);
      expect(
        await overlayerWrapBacking
          .connect(admin)
          .acceptProposedOvaDispatcherAllocation()
      ).to.emit(overlayerWrapBacking, "AaveNewTeamAllocation");
    });
  });

  describe("Dispatcher Configuration", function () {
    it("Should update rewards dispatcher contract address", async function () {
      const { overlayerWrapBacking, admin, alice } = await loadFixture(
        deployFixture
      );
      expect(
        await overlayerWrapBacking
          .connect(admin)
          .updateRewardsDispatcher(alice.address)
      ).to.emit(overlayerWrapBacking, "AaveNewTreasury");
    });
  });

  describe("Collateral Supply Operations", function () {
    it("Should properly supply collateral to backing contract", async function () {
      const {
        usdt,
        overlayerWrap,
        ausdt,
        overlayerWrapBacking,
        initialCollateralAmount,
        alice,
        bob
      } = await loadFixture(deployFixture);
      const amount1 = "1990";
      const amount2 = "2010";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount1, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount1)
      };
      await overlayerWrap.connect(alice).mint(order);
      const newOrder = {
        benefactor: bob.address,
        beneficiary: bob.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount2, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount2)
      };
      await overlayerWrap.connect(bob).mint(newOrder);
      const totalCollateral = (
        +amount1 +
        +amount2 +
        +initialCollateralAmount
      ).toFixed(2);
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(ethers.parseUnits(totalCollateral, await usdt.decimals()));
      expect(await overlayerWrap.connect(bob).supplyToBacking(0, 0)).to.emit(
        overlayerWrap,
        "SuppliedToBacking"
      );
      // Supply zero amounts
      expect(await overlayerWrap.connect(bob).supplyToBacking(0, 0)).to.emit(
        overlayerWrap,
        "SuppliedToBacking"
      );
      expect(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(totalCollateral, await ausdt.decimals())
      );
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(totalCollateral, await usdt.decimals())
      );
    });
  });

  describe("Multi-Asset Operations", function () {
    it("Should handle minting and redemption with multiple collateral types", async function () {
      const {
        usdt,
        aaveV3,
        ausdt,
        overlayerWrap,
        admin,
        overlayerWrapBacking,
        alice,
        initialCollateralAmount
      } = await loadFixture(deployFixture);

      const amount = "8.88";
      // Get some aUsdt
      await usdt
        .connect(admin)
        .approve(AAVE_POOL_V3_ADDRESS, ethers.MaxUint256);
      await aaveV3
        .connect(admin)
        .supply(
          await usdt.getAddress(),
          ethers.parseUnits((+amount * 3).toFixed(6), await ausdt.decimals()),
          await admin.getAddress(),
          0
        );
      await (ausdt.connect(admin) as Contract).transfer(
        alice.address,
        ethers.parseUnits((+amount * 3).toFixed(6), await usdt.decimals())
      );
      await ausdt
        .connect(alice)
        .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);

      const orderUsdt = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      const orderAUsdt = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await ausdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await ausdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(orderUsdt);
      await overlayerWrap.connect(alice).mint(orderAUsdt);
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(
        ethers.parseUnits(
          (+amount + +initialCollateralAmount).toFixed(2),
          await usdt.decimals()
        )
      );
      expect(
        await ausdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(amount, await usdt.decimals())
      );
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther((+amount * 2).toFixed(2))
      );

      await overlayerWrap.connect(alice).supplyToBacking(0, 0);
      await time.increase(60 * 60 * 24 * 30);

      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(
          (+amount + +amount + +initialCollateralAmount).toFixed(6),
          await usdt.decimals()
        )
      );

      await time.increase(60 * 60 * 24 * 30);

      await overlayerWrap.connect(alice).mint(orderUsdt);
      await overlayerWrap.connect(alice).mint(orderAUsdt);
      await overlayerWrap.connect(alice).supplyToBacking(0, 0);

      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(0);
      expect(
        await ausdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(0);

      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(
          (+amount * 4 + +initialCollateralAmount).toFixed(6),
          await usdt.decimals()
        )
      );
      const overlayerWrapAdminBalanceBefore = await overlayerWrap.balanceOf(
        await admin.getAddress()
      );

      await time.increase(60 * 60 * 24 * 30);

      const overlayerWrapUsdtBalBeforeCompound = await usdt.balanceOf(
        await overlayerWrap.getAddress()
      );
      await overlayerWrapBacking.connect(alice).compound(true);
      const overlayerWrapUsdtBalAfterCompound = await usdt.balanceOf(
        await overlayerWrap.getAddress()
      );
      expect(overlayerWrapUsdtBalAfterCompound).to.be.greaterThan(
        overlayerWrapUsdtBalBeforeCompound
      );
      const overlayerWrapAdminBalancAfter = await overlayerWrap.balanceOf(
        await admin.getAddress()
      );

      expect(overlayerWrapAdminBalancAfter).to.be.greaterThan(
        overlayerWrapAdminBalanceBefore
      );

      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther((+amount * 4).toFixed(2))
      );

      await time.increase(60 * 60 * 24 * 30);
      await overlayerWrap.connect(alice).mint(orderUsdt);
      await overlayerWrap.connect(alice).mint(orderAUsdt);
      await time.increase(60 * 60 * 24 * 30);
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(amount, await usdt.decimals())
      );
      expect(
        await ausdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(amount, await ausdt.decimals())
      );

      await overlayerWrap.connect(alice).redeem(orderUsdt);
      await overlayerWrap.connect(alice).redeem(orderAUsdt);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther((+amount * 4).toFixed(2))
      );
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(
          (+amount * 4 + +initialCollateralAmount).toFixed(6),
          await usdt.decimals()
        )
      );
      expect(overlayerWrapUsdtBalAfterCompound).to.be.equal(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      );
    });
  });

  describe("Redemption Operations", function () {
    it("Should process basic redemption requests", async function () {
      const { usdt, overlayerWrap, alice, initialCollateralAmount } =
        await loadFixture(deployFixture);
      const amount = "10";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(order);
      const totalCollateral = (+amount + +initialCollateralAmount).toFixed(2);
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(ethers.parseUnits(totalCollateral, await usdt.decimals()));
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther(amount)
      );
      await overlayerWrap.connect(alice).redeem(order);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(0);
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(
        ethers.parseUnits(initialCollateralAmount, await usdt.decimals())
      );
      expect(await usdt.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits("5000", await usdt.decimals())
      );
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(0);
    });

    it("Should allow USDT redemption when collateral is aUSDT", async function () {
      const {
        usdt,
        aaveV3,
        ausdt,
        overlayerWrap,
        admin,
        overlayerWrapBacking,
        alice,
        initialCollateralAmount
      } = await loadFixture(deployFixture);

      const amount = "10";
      // Get some aUsdt
      await usdt
        .connect(admin)
        .approve(AAVE_POOL_V3_ADDRESS, ethers.MaxUint256);
      await aaveV3
        .connect(admin)
        .supply(
          await usdt.getAddress(),
          ethers.parseUnits((+amount * 3).toFixed(6), await ausdt.decimals()),
          await admin.getAddress(),
          0
        );
      await (ausdt.connect(admin) as Contract).transfer(
        alice.address,
        ethers.parseUnits((+amount * 3).toFixed(6), await usdt.decimals())
      );
      await ausdt
        .connect(alice)
        .approve(await overlayerWrap.getAddress(), ethers.MaxUint256);

      const orderAUsdt = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await ausdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await ausdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      const orderUsdt = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await ausdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(orderAUsdt);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther(amount)
      );

      await overlayerWrap.connect(alice).supplyToBacking(0, 0);
      await time.increase(60 * 60 * 24 * 30);

      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(
          (+amount + +initialCollateralAmount).toFixed(6),
          await ausdt.decimals()
        )
      );

      await time.increase(60 * 60 * 24 * 30);

      const usdtBalBefore = ethers.formatUnits(
        await usdt.balanceOf(await alice.getAddress()),
        await usdt.decimals()
      );
      await overlayerWrap.connect(alice).redeem(orderUsdt);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(0);
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(initialCollateralAmount, await usdt.decimals())
      );
      expect(
        ethers.formatUnits(
          await usdt.balanceOf(await alice.getAddress()),
          await usdt.decimals()
        )
      ).to.be.equal((+usdtBalBefore + +amount).toFixed(1));
    });

    it("Should handle emergency aToken redemptions", async function () {
      const {
        ausdt,
        usdt,
        overlayerWrap,
        alice,
        admin,
        overlayerWrapBacking,
        initialCollateralAmount
      } = await loadFixture(deployFixture);
      const amount = "10";
      let order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      const totalCollateral = (+amount + +initialCollateralAmount).toFixed(2);
      await overlayerWrap.connect(alice).mint(order);
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(ethers.parseUnits(totalCollateral, await usdt.decimals()));

      await time.increase(60 * 60 * 24 * 30);

      // No assets in OverlayerWrap
      await overlayerWrap.connect(alice).supplyToBacking(0, 0);
      // Supply zero amounts
      await overlayerWrap.connect(alice).supplyToBacking(0, 0);

      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(0);
      expect(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(totalCollateral, await usdt.decimals())
      );

      const aliceUsdtBeforeBal = await usdt.balanceOf(alice.address);
      expect(await ausdt.balanceOf(alice.address)).to.be.equal(0);
      order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await ausdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await ausdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).redeem(order);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(0);
      // All collateral is in aToken
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(0);
      expect(await usdt.balanceOf(alice.address)).to.be.equal(
        aliceUsdtBeforeBal
      );
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(0);
      expect(await ausdt.balanceOf(alice.address)).to.be.greaterThanOrEqual(
        ethers.parseUnits(amount, await ausdt.decimals())
      );
      // Given back all
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).be.equal(
        ethers.parseUnits(initialCollateralAmount, await ausdt.decimals())
      );
    });

    it("Should properly handle donations exceeding total supply", async function () {
      const {
        admin,
        usdt,
        overlayerWrap,
        ausdt,
        overlayerWrapBacking,
        alice,
        bob,
        initialCollateralAmount
      } = await loadFixture(deployFixture);

      await usdt
        .connect(admin)
        .transfer(bob.address, ethers.parseUnits("100", 6));

      const donationAmount = "100";
      await usdt
        .connect(bob)
        .transfer(
          await overlayerWrap.getAddress(),
          ethers.parseUnits(donationAmount, 6)
        );
      // The donation above should only forward assets to the backing contract without modifing the supplied stable coins trakcer
      await overlayerWrap.connect(bob).supplyToBacking(0, 0);
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(initialCollateralAmount, await usdt.decimals())
      );
    });

    it("Should maintain correct accounting with donations", async function () {
      const {
        admin,
        usdt,
        overlayerWrap,
        ausdt,
        overlayerWrapBacking,
        alice,
        bob,
        initialCollateralAmount
      } = await loadFixture(deployFixture);

      await usdt
        .connect(admin)
        .transfer(bob.address, ethers.parseUnits("100", 6));

      const amount = "1000";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(order);
      await overlayerWrap.connect(alice).supplyToBacking(0, 0);
      // Donate
      const donationAmount = "50";
      await usdt
        .connect(bob)
        .transfer(
          await overlayerWrap.getAddress(),
          ethers.parseUnits(donationAmount, 6)
        );
      // The donation above should only forward assets to the backing contract without modifing the supplied stable coins trakcer
      await overlayerWrap.connect(bob).supplyToBacking(0, 0);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther(amount)
      );
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(ethers.parseUnits("0", await usdt.decimals()));
      expect(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(
          (+amount + +donationAmount + +initialCollateralAmount).toFixed(2),
          await ausdt.decimals()
        )
      );
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(
          (+amount + +initialCollateralAmount).toFixed(2),
          await usdt.decimals()
        )
      );

      // Donate
      await usdt
        .connect(bob)
        .transfer(
          await overlayerWrap.getAddress(),
          ethers.parseUnits(donationAmount, 6)
        );
      await overlayerWrap.connect(bob).supplyToBacking(0, 0);

      const redeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).redeem(redeemOrder);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther("0")
      );
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(0);
      // Donation should not influence the supplied usdt and usdt accounting
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(initialCollateralAmount, await usdt.decimals())
      );
      //################################################################################################################################################
      //account yield for aToken -> use greaterThanOrEqual
      expect(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(
          (
            +donationAmount +
            +donationAmount +
            +initialCollateralAmount
          ).toFixed(2),
          await ausdt.decimals()
        ) // We donated 2 times
      );
      // Initial amount
      expect(await overlayerWrap.totalSupply()).to.be.equal(
        ethers.parseEther(initialCollateralAmount)
      );
    });

    it("Should process withdrawals from backing contract", async function () {
      const {
        usdt,
        overlayerWrap,
        ausdt,
        overlayerWrapBacking,
        alice,
        initialCollateralAmount
      } = await loadFixture(deployFixture);
      const amount = "1000";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(order);
      await overlayerWrap.connect(alice).supplyToBacking(0, 0);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther(amount)
      );
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(ethers.parseUnits("0", await usdt.decimals()));
      expect(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(
          (+amount + +initialCollateralAmount * 0.99).toFixed(6),
          await ausdt.decimals()
        )
      );
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(
          (+amount + +initialCollateralAmount).toFixed(2),
          await usdt.decimals()
        )
      );

      const redeemAmount = "500";
      const redeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(
          redeemAmount,
          await usdt.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(redeemAmount)
      };
      await overlayerWrap.connect(alice).redeem(redeemOrder);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther((+amount - +redeemAmount).toFixed(1))
      );
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(0);
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(
          (+amount - +redeemAmount + +initialCollateralAmount).toFixed(2),
          await usdt.decimals()
        )
      );
      //################################################################################################################################################
      //account yield for aToken -> use greaterThanOrEqual
      expect(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(
          (+amount - +redeemAmount + +initialCollateralAmount).toFixed(2),
          await ausdt.decimals()
        )
      );
      //################################################################################################################################################

      //remove all collateral
      const secondRedeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(
          redeemAmount,
          await usdt.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(redeemAmount)
      };
      const ausdtBefore = ethers.formatUnits(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress()),
        await ausdt.decimals()
      );
      await overlayerWrap.connect(alice).redeem(secondRedeemOrder);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(0);
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(0);
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(initialCollateralAmount, await usdt.decimals())
      );
      //################################################################################################################################################
      //account yield for aToken -> use greaterThanOrEqual
      const ausdtAfter = ethers.formatUnits(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress()),
        await ausdt.decimals()
      );
      expect(+ausdtAfter + +redeemAmount).to.be.greaterThanOrEqual(
        +ausdtBefore
      );
      //################################################################################################################################################
    });

    it("Should handle aToken withdrawals from backing", async function () {
      const {
        usdt,
        overlayerWrap,
        ausdt,
        overlayerWrapBacking,
        alice,
        admin,
        initialCollateralAmount
      } = await loadFixture(deployFixture);
      const amount = "1000";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(order);
      await overlayerWrap.connect(alice).supplyToBacking(0, 0);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther(amount)
      );
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(ethers.parseUnits("0", await usdt.decimals()));
      expect(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(
          (+amount + +initialCollateralAmount * 0.99).toFixed(6),
          await ausdt.decimals()
        )
      );
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(
          (+amount + +initialCollateralAmount).toFixed(2),
          await usdt.decimals()
        )
      );

      const redeemAmount = "500";
      const redeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(
          redeemAmount,
          await usdt.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(redeemAmount)
      };
      await overlayerWrap.connect(alice).redeem(redeemOrder);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther((+amount - +redeemAmount).toFixed(1))
      );
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(0);
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(
          (+amount - +redeemAmount + +initialCollateralAmount).toFixed(1),
          await usdt.decimals()
        )
      );
      //################################################################################################################################################
      //account yield for aToken -> use greaterThanOrEqual
      expect(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(
          (+amount - +redeemAmount + +initialCollateralAmount).toFixed(1),
          await ausdt.decimals()
        )
      );
      //################################################################################################################################################

      await overlayerWrap.connect(alice).supplyToBacking(0, 0);

      expect(await ausdt.balanceOf(alice.address)).to.be.equal(0);

      //remove all collateral
      const secondRedeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await ausdt.getAddress(),
        collateralAmount: ethers.parseUnits(
          (+amount - +redeemAmount).toFixed(1),
          await ausdt.decimals()
        ),
        overlayerWrapAmount: ethers.parseEther(
          (+amount - +redeemAmount).toFixed(1)
        )
      };
      const ausdtBefore = ethers.formatUnits(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress()),
        await ausdt.decimals()
      );
      // expect(ausdtBefore).to.be.equal(0);
      await overlayerWrap.connect(alice).redeem(secondRedeemOrder);
      expect(await overlayerWrap.balanceOf(alice.address)).to.be.equal(0);
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(0);
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(initialCollateralAmount, await usdt.decimals())
      );
      expect(await ausdt.balanceOf(alice.address)).to.be.greaterThanOrEqual(
        ethers.parseUnits(
          ((+amount - +redeemAmount) * 0.99).toFixed(6),
          await ausdt.decimals()
        )
      );
    });
  });

  describe("Yield Distribution", function () {
    it("Should properly compound and distribute staking rewards", async function () {
      const { usdt, overlayerWrap, sOverlayerWrap, alice } = await loadFixture(
        deployFixture
      );
      const amount = "1000";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(order);
      await overlayerWrap.connect(alice).supplyToBacking(0, 0);

      await overlayerWrap
        .connect(alice)
        .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);

      await time.increase(3600 * 100);

      // RewardsReceived is emitted from the compounding effect
      expect(
        await sOverlayerWrap
          .connect(alice)
          .deposit(ethers.parseEther(amount), alice.address)
      ).to.emit(sOverlayerWrap, "RewardsReceived");

      await time.increase(3600 * 100);

      expect(
        await sOverlayerWrap
          .connect(alice)
          .withdraw(ethers.parseEther(amount), alice.address, alice.address)
      ).to.emit(sOverlayerWrap, "RewardsReceived");
    });
  });

  describe("Yield Management", function () {
    it("Should mint and distribute yield between stakeholders", async function () {
      const {
        usdt,
        overlayerWrap,
        sOverlayerWrap,
        ausdt,
        overlayerWrapBacking,
        admin,
        alice
      } = await loadFixture(deployFixture);
      const amount = "1000";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(order);
      await overlayerWrap.connect(alice).supplyToBacking(0, 0);

      const ausdtBefore = ethers.formatUnits(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress()),
        await ausdt.decimals()
      );
      //advance time
      await time.increase(12 * 30 * 24 * 60 * 60); //12 months
      const ausdtAfter = ethers.formatUnits(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress()),
        await ausdt.decimals()
      );

      const diffUsdt = new Big(ausdtAfter).minus(ausdtBefore);

      //test to fixed 2 decimals
      await overlayerWrapBacking.connect(admin).compound(true);
      const teamRewardAllocation = ethers.formatEther(
        await overlayerWrap.balanceOf(admin.address)
      );
      expect((+teamRewardAllocation).toFixed(2)).to.be.equal(
        diffUsdt.mul(20).div(100).toFixed(2)
      );

      const expectedStakingAssets = diffUsdt
        .mul(80)
        .div(100)
        .plus(1)
        .toFixed(2);
      const realStakingAssets = (+ethers.formatEther(
        await sOverlayerWrap.totalAssets()
      )).toFixed(2);
      expect(realStakingAssets).to.be.equal(expectedStakingAssets);
    });

    it("Should handle yield distribution with aToken holdings", async function () {
      const {
        usdt,
        overlayerWrap,
        sOverlayerWrap,
        ausdt,
        overlayerWrapBacking,
        admin,
        alice
      } = await loadFixture(deployFixture);
      const amount = "1000";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(order);
      await overlayerWrap.connect(alice).supplyToBacking(0, 0);

      const ausdtBefore = ethers.formatUnits(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress()),
        await ausdt.decimals()
      );
      //advance time
      await time.increase(12 * 30 * 24 * 60 * 60); //12 months
      const ausdtAfter = ethers.formatUnits(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress()),
        await ausdt.decimals()
      );

      const diffUsdt = new Big(ausdtAfter).minus(ausdtBefore);

      //test to fixed 2 decimals
      await overlayerWrapBacking.connect(admin).compound(true);

      const teamRewardAllocation = ethers.formatEther(
        await overlayerWrap.balanceOf(admin.address)
      );
      expect((+teamRewardAllocation).toFixed(2)).to.be.equal(
        diffUsdt.mul(20).div(100).toFixed(2)
      );

      const expectedToStakingAssets = diffUsdt
        .mul(80)
        .div(100)
        .plus(1)
        .toFixed(2);
      const realToStakingAssets = (+ethers.formatEther(
        await sOverlayerWrap.totalAssets()
      )).toFixed(2);
      expect(realToStakingAssets).to.be.equal(expectedToStakingAssets);

      const beforeEmergencyTeamAllocation = await overlayerWrap.balanceOf(
        admin.address
      );
      expect(
        await ausdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(0);

      await overlayerWrap.connect(admin).supplyToBacking(0, 0);
      await time.increase(2 * 24 * 60 * 60); //2 days
      await overlayerWrapBacking.connect(admin).compound(false); // Compound aTokens

      expect(
        await overlayerWrap.balanceOf(admin.address)
      ).to.be.greaterThanOrEqual(beforeEmergencyTeamAllocation);
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(0);
      expect(
        await ausdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.greaterThan(0);
    });
  });

  describe("Emergency Operations", function () {
    it("Should safely unstake and return funds during emergency", async function () {
      const {
        usdt,
        overlayerWrap,
        ausdt,
        overlayerWrapBacking,
        admin,
        alice,
        dispatcher,
        initialCollateralAmount
      } = await loadFixture(deployFixture);
      const amount = "1000";
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateralAmount: ethers.parseUnits(amount, await usdt.decimals()),
        overlayerWrapAmount: ethers.parseEther(amount)
      };
      await overlayerWrap.connect(alice).mint(order);
      expect(await overlayerWrap.connect(alice).supplyToBacking(0, 0)).to.emit(
        overlayerWrap,
        "SuppliedToBacking"
      );
      expect(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(
          ((+amount + +initialCollateralAmount) * 0.99).toFixed(1),
          await ausdt.decimals()
        )
      );
      expect(
        await ausdt.balanceOf(await overlayerWrapBacking.getAddress())
      ).to.be.lessThanOrEqual(
        ethers.parseUnits(
          ((+amount + +initialCollateralAmount) * 1.01).toFixed(1),
          await ausdt.decimals()
        )
      );
      expect(await overlayerWrapBacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(
          (+amount + +initialCollateralAmount).toFixed(1),
          await usdt.decimals()
        )
      );
      expect(
        await usdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.equal(0);

      await time.increase(12 * 30 * 24 * 60 * 60); //12 months

      let ausdtBal = await ausdt.balanceOf(
        await overlayerWrapBacking.getAddress()
      );
      await overlayerWrapBacking.connect(admin).adminWithdraw();

      const atLeastUsdtAdmin =
        0.99 *
        (+ethers.formatUnits(ausdtBal, await usdt.decimals()) -
          +amount -
          +initialCollateralAmount);

      expect(
        await ausdt.balanceOf(await dispatcher.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(atLeastUsdtAdmin.toFixed(4), await ausdt.decimals())
      );

      expect(
        await ausdt.balanceOf(await overlayerWrap.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(
          ((+amount + +initialCollateralAmount) * 0.99).toFixed(1),
          await ausdt.decimals()
        )
      );
    });
  });
});
