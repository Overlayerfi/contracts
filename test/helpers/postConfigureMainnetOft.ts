import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { LZ_ENDPOINT_ETH_MAINNET_V2 } from "../../scripts/addresses";
import { HARDHAT_CHAIN_ID } from "../../scripts/constants";
import { MainnetProductDeploymentResult } from "../../scripts/utils/postConfigureMainnetOftFromOmnichainDeployments";

export const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
export const COLLATERAL_MANAGER_ROLE = ethers.keccak256(
  ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")
);
export const REWARDER_ROLE = ethers.keccak256(
  ethers.toUtf8Bytes("REWARDER_ROLE")
);

export async function deployWrapAndStaking(args: {
  admin: Signer & { address: string };
  collateralAddr: string;
  aCollateralAddr: string;
  collateralDecimals: number;
  aCollateralDecimals: number;
  name: string;
  symbol: string;
  wrapContract: "OverlayerWrap" | "OverlayerWrapMock";
  txOpts: { maxFeePerGas: bigint };
}) {
  const overlayerWrap = await (
    await ethers.getContractFactory(args.wrapContract)
  ).deploy(
    {
      admin: args.admin.address,
      lzEndpoint: LZ_ENDPOINT_ETH_MAINNET_V2,
      name: args.name,
      symbol: args.symbol,
      collateral: {
        addr: args.collateralAddr,
        decimals: args.collateralDecimals
      },
      aCollateral: {
        addr: args.aCollateralAddr,
        decimals: args.aCollateralDecimals
      },
      maxMintPerBlock: ethers.MaxUint256,
      maxRedeemPerBlock: ethers.MaxUint256,
      minValmaxRedeemPerBlock: 1n,
      hubChainId: HARDHAT_CHAIN_ID
    },
    args.txOpts
  );
  await overlayerWrap.waitForDeployment();

  const sOverlayerWrap = await (
    await ethers.getContractFactory("StakedOverlayerWrap")
  ).deploy(
    await overlayerWrap.getAddress(),
    args.admin.address,
    args.admin.address,
    args.txOpts
  );
  await sOverlayerWrap.waitForDeployment();

  return { overlayerWrap, sOverlayerWrap };
}

export async function assertPostConfigureProduct(args: {
  result: MainnetProductDeploymentResult;
  admin: Signer & { address: string };
  overlayerWrap: Contract;
  sOverlayerWrap: Contract;
  collateral: Contract;
  aCollateralAddr: string;
  backingName: "OverlayerWrapBacking" | "OverlayerWrapGhoBacking";
  collateralDecimals: number;
}) {
  const wrapAddr = await args.overlayerWrap.getAddress();
  const stakingAddr = await args.sOverlayerWrap.getAddress();
  const backingAddr = args.result.overlayerWrapBackingAddress;
  const backing = await ethers.getContractAt(args.backingName, backingAddr);

  expect(args.result.backingContract).to.equal(args.backingName);
  expect(args.result.oftOverlayerWrapAddr).to.equal(wrapAddr);
  expect(args.result.stakedOverlayerWrapAddr).to.equal(stakingAddr);
  expect(args.result.dispatcherAddress).to.not.equal(ethers.ZeroAddress);

  expect(await backing.owner()).to.equal(args.admin.address);
  expect(await backing.overlayerWrap()).to.equal(wrapAddr);
  expect(await backing.sOverlayerWrap()).to.equal(stakingAddr);
  expect(await backing.collateral()).to.equal(
    await args.collateral.getAddress()
  );
  expect(await backing.aCollateral()).to.equal(args.aCollateralAddr);
  expect(await backing.ovaRewardsDispatcher()).to.equal(
    args.result.dispatcherAddress
  );

  expect(await args.sOverlayerWrap.overlayerWrapBacking()).to.equal(
    backingAddr
  );
  expect(await args.overlayerWrap.getSpender()).to.equal(backingAddr);
  expect(
    await args.overlayerWrap.hasRole(
      COLLATERAL_MANAGER_ROLE,
      args.admin.address
    )
  ).to.equal(true);
  expect(
    await args.overlayerWrap.hasRole(DEFAULT_ADMIN_ROLE, args.admin.address)
  ).to.equal(true);
  expect(await args.sOverlayerWrap.hasRole(REWARDER_ROLE, backingAddr)).to.equal(
    true
  );

  const seedOw = ethers.parseEther("1");
  const seedCollateral = ethers.parseUnits("1", args.collateralDecimals);
  expect(await args.overlayerWrap.totalSupply()).to.equal(seedOw);
  expect(await args.sOverlayerWrap.totalAssets()).to.equal(seedOw);
  expect(await args.overlayerWrap.balanceOf(stakingAddr)).to.equal(seedOw);
  expect(await args.collateral.balanceOf(wrapAddr)).to.equal(seedCollateral);

  await args.overlayerWrap.connect(args.admin).supplyToBacking(0n, 0n);
  expect(await backing.totalSuppliedCollateral()).to.equal(seedCollateral);
  expect(await args.collateral.balanceOf(wrapAddr)).to.equal(0n);

  return backing;
}