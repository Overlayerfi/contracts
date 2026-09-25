import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { config, ethers, network } from "hardhat";
import { expect } from "chai";
import { getContractAddress } from "@ethersproject/address";
import {
  AAVE_POOL_V3_ADDRESS,
  GHO_ADDRESS,
  LZ_ENDPOINT_ETH_MAINNET_V2,
  SGHO_ADDRESS,
  WETH_MAINNET_ADDRESS
} from "../scripts/addresses";
import { AAVE_POOL_V3_ABI } from "../scripts/abi/AAVE_POOL_V3";
import { WETH_ABI } from "../scripts/abi/WETH_abi";
import ERC20_ABI from "./ERC20_ABI.json";
import { swap } from "../scripts/uniswap_swapper/proxy";
import { Contract } from "ethers";
import { HARDHAT_CHAIN_ID } from "../scripts/constants";

const IERC4626_ABI = [
  "function asset() view returns (address)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function maxWithdraw(address owner) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)"
];

/**
 * Full GHO / sGHO integration on a mainnet fork.
 */
describe("GHO mainnet fork integration", function () {
  this.timeout(120000);

  async function resetFork() {
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
  }

  /**
   * Borrow GHO on Aave V3 after supplying WETH collateral (GSM USDC→GHO reverts on this fork block).
   */
  async function acquireGhoViaAave(
    user: { address: string },
    ghoAmount: bigint,
    txOpts: { maxFeePerGas: bigint }
  ) {
    const weth = new ethers.Contract(
      WETH_MAINNET_ADDRESS,
      WETH_ABI,
      ethers.provider
    );
    const pool = new ethers.Contract(
      AAVE_POOL_V3_ADDRESS,
      AAVE_POOL_V3_ABI,
      ethers.provider
    );
    const gho = new ethers.Contract(GHO_ADDRESS, ERC20_ABI, ethers.provider);
    let wethBal = await weth.balanceOf(user.address);
    if (wethBal === 0n) {
      await (weth.connect(user) as Contract).deposit({
        value: ethers.parseEther("10"),
        ...txOpts
      });
      wethBal = await weth.balanceOf(user.address);
    }
    await (weth.connect(user) as Contract).approve(
      AAVE_POOL_V3_ADDRESS,
      wethBal,
      txOpts
    );
    await (pool.connect(user) as Contract).supply(
      WETH_MAINNET_ADDRESS,
      wethBal,
      user.address,
      0,
      txOpts
    );
    await (pool.connect(user) as Contract).borrow(
      GHO_ADDRESS,
      ghoAmount,
      2,
      0,
      user.address,
      txOpts
    );
    expect(await gho.balanceOf(user.address)).to.be.gte(ghoAmount);
  }

  /** Drain on-hand GHO from the sGHO vault (simulates liquidity shortfall vs index). */
  async function drainSghoOnHandGho(
    admin: { address: string },
    gho: Contract,
    keepGho: bigint,
    txOpts: { maxFeePerGas: bigint }
  ) {
    const onHand = await gho.balanceOf(SGHO_ADDRESS);
    if (onHand <= keepGho) return;
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [SGHO_ADDRESS]
    });
    await network.provider.send("hardhat_setBalance", [
      SGHO_ADDRESS,
      "0x1000000000000000000"
    ]);
    const vaultSigner = await ethers.getSigner(SGHO_ADDRESS);
    await (gho.connect(vaultSigner) as Contract).transfer(
      admin.address,
      onHand - keepGho,
      txOpts
    );
    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [SGHO_ADDRESS]
    });
  }

  async function deployGhoStackFixture() {
    await resetFork();

    const [admin, , alice] = await ethers.getSigners();
    const block = await admin.provider.getBlock("latest");
    const baseFee = block?.baseFeePerGas ?? 1n;
    const txOpts = { maxFeePerGas: baseFee * BigInt(10) };

    await swap("25", "15", 1);
    await acquireGhoViaAave(admin, ethers.parseEther("2500"), txOpts);

    const gho = new ethers.Contract(GHO_ADDRESS, ERC20_ABI, ethers.provider);
    const sgho = new ethers.Contract(
      SGHO_ADDRESS,
      [...ERC20_ABI, ...IERC4626_ABI],
      ethers.provider
    );

    expect(await sgho.asset()).to.equal(GHO_ADDRESS);

    const ghoDecimals = await gho.decimals();
    const sghoDecimals = await sgho.decimals();
    const excluded = await (
      await ethers.getContractFactory("GhoExcludedCollateral")
    ).deploy(txOpts);
    await excluded.waitForDeployment();

    const OverlayerWrap = await ethers.getContractFactory("OverlayerWrap");
    const overlayerWrap = await OverlayerWrap.deploy(
      {
        admin: await admin.getAddress(),
        lzEndpoint: LZ_ENDPOINT_ETH_MAINNET_V2,
        name: "O-GHO",
        symbol: "O+GHO",
        collateral: { addr: GHO_ADDRESS, decimals: ghoDecimals },
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

    const sOverlayerWrap = await (
      await ethers.getContractFactory("StakedOverlayerWrap")
    ).deploy(
      await overlayerWrap.getAddress(),
      admin.address,
      admin.address,
      txOpts
    );

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
      GHO_ADDRESS,
      SGHO_ADDRESS,
      txOpts
    );
    await backing.waitForDeployment();
    expect(await backing.getAddress()).to.equal(futureBacking);

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

    const seedGho = ethers.parseEther("1");
    await (gho.connect(admin) as Contract).approve(
      await overlayerWrap.getAddress(),
      ethers.MaxUint256
    );
    await overlayerWrap.connect(admin).mint({
      benefactor: admin.address,
      beneficiary: admin.address,
      collateral: GHO_ADDRESS,
      collateralAmount: seedGho,
      overlayerWrapAmount: seedGho
    });
    await overlayerWrap
      .connect(admin)
      .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
    await sOverlayerWrap.connect(admin).deposit(seedGho, admin.address);

    await backing.connect(admin).acceptCollateralSpender();
    await overlayerWrap.connect(admin).supplyToBacking(0n, 0n);

    const fundAlice = ethers.parseEther("200");
    await (gho.connect(admin) as Contract).transfer(alice.address, fundAlice);
    await (gho.connect(alice) as Contract).approve(
      await overlayerWrap.getAddress(),
      ethers.MaxUint256
    );
    await (gho.connect(alice) as Contract).approve(
      await sOverlayerWrap.getAddress(),
      ethers.MaxUint256
    );

    return {
      admin,
      alice,
      gho,
      sgho,
      overlayerWrap,
      sOverlayerWrap,
      backing,
      dispatcher,
      ghoDecimals,
      seedGho,
      txOpts
    };
  }

  async function backingVaultAssets(
    sgho: Contract,
    backingAddr: string
  ): Promise<bigint> {
    const shares = await sgho.balanceOf(backingAddr);
    return sgho.convertToAssets(shares);
  }

  it("mints OW with GHO, supplies to sGHO, accrues yield, compounds, and redeems principal", async function () {
    const { admin, alice, gho, sgho, overlayerWrap, backing, seedGho } =
      await loadFixture(deployGhoStackFixture);

    const backingAddr = await backing.getAddress();
    const depositGho = ethers.parseEther("100");

    await overlayerWrap.connect(alice).mint({
      benefactor: alice.address,
      beneficiary: alice.address,
      collateral: GHO_ADDRESS,
      collateralAmount: depositGho,
      overlayerWrapAmount: depositGho
    });
    await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

    const tsAfterSupply = await backing.totalSuppliedCollateral();
    expect(tsAfterSupply).to.equal(depositGho + seedGho);

    const assetsAfterSupply = await backingVaultAssets(sgho, backingAddr);
    expect(assetsAfterSupply).to.be.gte(tsAfterSupply);

    await time.increase(30 * 24 * 60 * 60);

    const assetsAfterTime = await backingVaultAssets(sgho, backingAddr);
    expect(assetsAfterTime).to.be.gt(tsAfterSupply);

    const theoreticalYield = assetsAfterTime - tsAfterSupply;
    // sGHO withdrawals are capped by on-hand GHO; top up like DAO liquidity provisioning.
    await (gho.connect(admin) as Contract).transfer(
      SGHO_ADDRESS,
      theoreticalYield
    );

    const owSupplyBeforeCompound = await overlayerWrap.totalSupply();
    const maxWithdrawBefore = await sgho.maxWithdraw(backingAddr);
    expect(maxWithdrawBefore).to.be.gt(tsAfterSupply);

    await backing.connect(admin).compound(false);

    expect(await backing.totalSuppliedCollateral()).to.equal(tsAfterSupply);
    expect(await overlayerWrap.totalSupply()).to.be.gt(owSupplyBeforeCompound);

    const assetsAfterCompound = await backingVaultAssets(sgho, backingAddr);
    expect(assetsAfterCompound).to.be.closeTo(
      tsAfterSupply,
      ethers.parseEther("1")
    );

    await overlayerWrap.connect(alice).redeem({
      benefactor: alice.address,
      beneficiary: alice.address,
      collateral: GHO_ADDRESS,
      collateralAmount: depositGho,
      overlayerWrapAmount: depositGho
    });

    expect(await overlayerWrap.balanceOf(alice.address)).to.equal(0n);
    // Seed OW remains staked; backing keeps seed principal plus any sGHO yield not compounded.
    expect(await backing.totalSuppliedCollateral()).to.be.closeTo(
      seedGho,
      ethers.parseEther("1")
    );
    expect(await gho.balanceOf(alice.address)).to.be.gte(depositGho);
  });

  it("compound defers the harvest when sGHO index shows yield but maxWithdraw does not exceed principal", async function () {
    const { admin, alice, gho, sgho, overlayerWrap, backing, seedGho, txOpts } =
      await loadFixture(deployGhoStackFixture);

    const backingAddr = await backing.getAddress();
    const depositGho = ethers.parseEther("50");

    await overlayerWrap.connect(alice).mint({
      benefactor: alice.address,
      beneficiary: alice.address,
      collateral: GHO_ADDRESS,
      collateralAmount: depositGho,
      overlayerWrapAmount: depositGho
    });
    await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

    const ts = await backing.totalSuppliedCollateral();
    expect(ts).to.equal(depositGho + seedGho);
    await time.increase(30 * 24 * 60 * 60);

    const assetsAfterTime = await backingVaultAssets(sgho, backingAddr);
    expect(assetsAfterTime).to.be.gt(ts);

    await drainSghoOnHandGho(admin, gho, 0n, txOpts);
    expect(await sgho.maxWithdraw(backingAddr)).to.equal(0n);

    const owSupplyBefore = await overlayerWrap.totalSupply();
    const sharesBefore = await sgho.balanceOf(backingAddr);
    await expect(backing.connect(admin).compound(false)).to.emit(
      backing,
      "GhoSghoHarvestDeferred"
    );

    expect(await overlayerWrap.totalSupply()).to.equal(owSupplyBefore);
    expect(await backing.totalSuppliedCollateral()).to.equal(ts);
    expect(await sgho.balanceOf(backingAddr)).to.equal(sharesBefore);
    expect(await gho.balanceOf(backingAddr)).to.equal(0n);
  });

  it("adminWithdraw returns user principal as GHO and routes sGHO surplus to dispatcher", async function () {
    const {
      admin,
      alice,
      gho,
      sgho,
      overlayerWrap,
      backing,
      dispatcher,
      seedGho
    } = await loadFixture(deployGhoStackFixture);

    const backingAddr = await backing.getAddress();
    const dispatcherAddr = await dispatcher.getAddress();
    const wrapAddr = await overlayerWrap.getAddress();
    const depositGho = ethers.parseEther("100");
    const aliceGhoBeforeMint = await gho.balanceOf(alice.address);

    await overlayerWrap.connect(alice).mint({
      benefactor: alice.address,
      beneficiary: alice.address,
      collateral: GHO_ADDRESS,
      collateralAmount: depositGho,
      overlayerWrapAmount: depositGho
    });
    await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

    const principal = await backing.totalSuppliedCollateral();
    expect(principal).to.equal(depositGho + seedGho);

    await time.increase(60 * 24 * 60 * 60);

    const assetsAfterTime = await backingVaultAssets(sgho, backingAddr);
    const naturalYield = assetsAfterTime - principal;
    expect(naturalYield).to.be.gt(0n);

    // Ensure the vault has enough on-hand GHO for adminWithdraw to unwind principal.
    await (gho.connect(admin) as Contract).transfer(SGHO_ADDRESS, naturalYield);
    expect(await sgho.maxWithdraw(backingAddr)).to.be.gte(principal);

    const dispatcherSharesBefore = await sgho.balanceOf(dispatcherAddr);

    await backing.connect(admin).adminWithdraw();

    expect(await backing.totalSuppliedCollateral()).to.equal(0n);
    expect(await sgho.balanceOf(backingAddr)).to.equal(0n);
    expect(await sgho.balanceOf(wrapAddr)).to.equal(0n);
    expect(await gho.balanceOf(wrapAddr)).to.equal(principal);

    const dispatcherSurplusShares =
      (await sgho.balanceOf(dispatcherAddr)) - dispatcherSharesBefore;
    expect(dispatcherSurplusShares).to.be.gt(0n);
    expect(await sgho.convertToAssets(dispatcherSurplusShares)).to.be.closeTo(
      naturalYield,
      ethers.parseEther("0.1")
    );

    await overlayerWrap.connect(alice).redeem({
      benefactor: alice.address,
      beneficiary: alice.address,
      collateral: GHO_ADDRESS,
      collateralAmount: depositGho,
      overlayerWrapAmount: depositGho
    });

    expect(await overlayerWrap.balanceOf(alice.address)).to.equal(0n);
    expect(await gho.balanceOf(alice.address)).to.equal(aliceGhoBeforeMint);
  });

  it("adminWithdraw degrades to a partial exit when sGHO cannot pay the whole principal", async function () {
    const {
      admin,
      alice,
      gho,
      sgho,
      overlayerWrap,
      backing,
      dispatcher,
      txOpts
    } = await loadFixture(deployGhoStackFixture);

    const backingAddr = await backing.getAddress();
    const dispatcherAddr = await dispatcher.getAddress();
    const wrapAddr = await overlayerWrap.getAddress();

    await overlayerWrap.connect(alice).mint({
      benefactor: alice.address,
      beneficiary: alice.address,
      collateral: GHO_ADDRESS,
      collateralAmount: ethers.parseEther("100"),
      overlayerWrapAmount: ethers.parseEther("100")
    });
    await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

    const principal = await backing.totalSuppliedCollateral();
    await time.increase(60 * 24 * 60 * 60);

    // Leave sGHO with only a fraction of the GHO the handler needs back.
    await drainSghoOnHandGho(admin, gho, ethers.parseEther("30"), txOpts);
    const payable = await sgho.maxWithdraw(backingAddr);
    expect(payable).to.be.gt(0n);
    expect(payable).to.be.lt(principal);
    expect(await gho.balanceOf(backingAddr)).to.equal(0n);

    const dispatcherSharesBefore = await sgho.balanceOf(dispatcherAddr);
    const wrapGhoBefore = await gho.balanceOf(wrapAddr);

    await expect(backing.connect(admin).adminWithdraw()).to.emit(
      backing,
      "GhoSghoAdminWithdrawPartial"
    );

    const delivered = (await gho.balanceOf(wrapAddr)) - wrapGhoBefore;
    expect(delivered).to.be.closeTo(payable, ethers.parseEther("0.01"));

    const remaining = await backing.totalSuppliedCollateral();
    expect(remaining).to.equal(principal - delivered);
    expect(remaining).to.be.gt(0n);
    // Shares left over still back `remaining`; the yield sweep must stay off.
    expect(await sgho.balanceOf(dispatcherAddr)).to.equal(
      dispatcherSharesBefore
    );
    expect(await backingVaultAssets(sgho, backingAddr)).to.be.gte(remaining);
  });

  it("stakes OW, compounds yield, unstakes more OW, redeems for more GHO, and routes protocol share to dispatcher accounts", async function () {
    const {
      admin,
      alice,
      gho,
      sgho,
      overlayerWrap,
      sOverlayerWrap,
      backing,
      dispatcher,
      seedGho
    } = await loadFixture(deployGhoStackFixture);

    const backingAddr = await backing.getAddress();
    const depositGho = ethers.parseEther("100");
    const ghoAtStart = await gho.balanceOf(alice.address);

    await overlayerWrap.connect(alice).mint({
      benefactor: alice.address,
      beneficiary: alice.address,
      collateral: GHO_ADDRESS,
      collateralAmount: depositGho,
      overlayerWrapAmount: depositGho
    });
    await overlayerWrap.connect(alice).supplyToBacking(0n, 0n);

    const tsAfterSupply = await backing.totalSuppliedCollateral();
    expect(tsAfterSupply).to.equal(depositGho + seedGho);

    await overlayerWrap
      .connect(alice)
      .approve(await sOverlayerWrap.getAddress(), ethers.MaxUint256);
    await sOverlayerWrap.connect(alice).deposit(depositGho, alice.address);

    await time.increase(60 * 24 * 60 * 60);

    const assetsAfterTime = await backingVaultAssets(sgho, backingAddr);
    const naturalYield = assetsAfterTime - tsAfterSupply;
    expect(naturalYield).to.be.gt(0n);

    await (gho.connect(admin) as Contract).transfer(SGHO_ADDRESS, naturalYield);

    const adminOwBeforeCompound = await overlayerWrap.balanceOf(admin.address);
    const sOwAssetsBeforeCompound = await sOverlayerWrap.totalAssets();

    await backing.connect(admin).compound(false);

    const dispatcherOwMinted =
      (await overlayerWrap.balanceOf(admin.address)) - adminOwBeforeCompound;
    const expectedDispatcherOw = (naturalYield * 20n) / 100n;
    expect(dispatcherOwMinted).to.be.closeTo(
      expectedDispatcherOw,
      ethers.parseEther("0.1")
    );
    expect(
      await overlayerWrap.balanceOf(await dispatcher.getAddress())
    ).to.equal(0n);

    const expectedStakingOw = (naturalYield * 80n) / 100n;
    expect(
      (await sOverlayerWrap.totalAssets()) - sOwAssetsBeforeCompound
    ).to.be.closeTo(expectedStakingOw, ethers.parseEther("0.1"));

    const aliceShares = await sOverlayerWrap.balanceOf(alice.address);
    const owFromStake = await sOverlayerWrap.previewRedeem(aliceShares);
    expect(owFromStake).to.be.gt(depositGho);

    await sOverlayerWrap
      .connect(alice)
      .redeem(aliceShares, alice.address, alice.address);

    const aliceOw = await overlayerWrap.balanceOf(alice.address);
    expect(aliceOw).to.be.gt(depositGho);

    const ghoBeforeRedeem = await gho.balanceOf(alice.address);
    await overlayerWrap.connect(alice).redeem({
      benefactor: alice.address,
      beneficiary: alice.address,
      collateral: GHO_ADDRESS,
      collateralAmount: aliceOw,
      overlayerWrapAmount: aliceOw
    });

    const ghoFromRedeem =
      (await gho.balanceOf(alice.address)) - ghoBeforeRedeem;
    expect(ghoFromRedeem).to.be.gt(depositGho);
    expect(await gho.balanceOf(alice.address)).to.be.gt(ghoAtStart);
  });
});
