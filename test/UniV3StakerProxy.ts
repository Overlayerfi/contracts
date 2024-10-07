import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { DAI_ADDRESS, WETH_MAINNET_ADDRESS } from "../scripts/addresses";
import {
  createIncentive,
  deploy,
  depositAndStake,
  getDepositInfo,
  getPool,
  rewardBalance,
  transferDeposit,
  unstake
} from "../scripts/uniswap_staker/proxy";
import ProxyAbi from "../artifacts/contracts/uniswap/UniswapV3StakerProxy.sol/UniswapV3StakerProxy.json";
import ReferralAbi from "../artifacts/contracts/token/OvaReferral.sol/OvaReferral.json";
import { mintPosition } from "../scripts/uniswap_liquidity/proxy";

describe("UniswapV3StakerProxy", function () {
  async function deployFixture() {
    const [deployer, bob, alice] = await ethers.getSigners();

    const startTime = (await time.latest()) + 60 * 60;
    const endTime = (await time.latest()) + 60 * 60 * 24 * 30 * 12; //~1 year
    const token0 = DAI_ADDRESS;
    const token1 = WETH_MAINNET_ADDRESS;
    const owner = deployer.address;
    const incentiveAmount = "1000";

    // This will deploy the proxy contract and the referral token
    // From now on reward token and referral are the same contract
    const ret = await deploy();
    const proxyAddress = ret.proxy;
    const referralAddress = ret.reward;
    // Create incentive
    await createIncentive(
      token0,
      token1,
      ret.reward,
      incentiveAmount,
      startTime,
      endTime,
      proxyAddress
    );

    //set referral in the proxy contract
    const proxy = new ethers.Contract(proxyAddress, ProxyAbi.abi, deployer);
    await proxy.updateReferral(referralAddress);

    //set the proxy contract as minter
    const referral = new ethers.Contract(
      referralAddress,
      ReferralAbi.abi,
      deployer
    );
    await referral.setMinter(proxyAddress);
    // set proxy contract as allowed referral tracker
    await referral.addPointsTracker(proxyAddress);

    const incentiveKey = {
      rewardToken: ret.reward,
      pool: await getPool(proxyAddress, token0, token1),
      startTime: startTime,
      endTime: endTime,
      refundee: owner
    };

    return {
      proxy,
      referral,
      token0,
      token1,
      deployer,
      bob,
      alice,
      startTime,
      endTime,
      incentiveKey,
      incentiveAmount
    };
  }

  describe("UniV3 staking & referral bonus", function () {
    it("Should stake and unstake", async function () {
      const {
        proxy,
        bob,
        referral,
        token0,
        token1,
        deployer,
        startTime,
        incentiveKey
      } = await loadFixture(deployFixture);
      // Mint Uni position
      const mintResult = await mintPosition(
        token0,
        token1,
        18,
        18,
        "10",
        "0.0001",
        100,
        deployer,
        "1"
      );

      // Advance time
      await time.increaseTo(startTime + 60 * 60 * 2);

      // Stake tokenId
      await depositAndStake(
        mintResult.tokenId.toString(),
        incentiveKey,
        ethers.ZeroAddress,
        deployer,
        await proxy.getAddress()
      );

      const owner = await getDepositInfo(mintResult.tokenId.toString());
      expect(owner).to.be.equal(deployer.address);

      // Advance time
      await time.increaseTo(startTime + 60 * 60 * 10);

      await transferDeposit(mintResult.tokenId, await proxy.getAddress());
      await unstake(
        mintResult.tokenId.toString(),
        incentiveKey,
        await proxy.getAddress(),
        await referral.getAddress(),
        bob.address,
        deployer
      );

      expect(
        +(await rewardBalance(await referral.getAddress(), bob.address))
      ).to.be.greaterThan(0);
    });

    it("Should stake with referral and collect bonus", async function () {
      const {
        proxy,
        referral,
        token0,
        token1,
        deployer,
        bob,
        alice,
        startTime,
        endTime,
        incentiveKey,
        incentiveAmount
      } = await loadFixture(deployFixture);
      // Mint Uni position
      const mintResultA = await mintPosition(
        token0,
        token1,
        18,
        18,
        "10",
        "0.0001",
        100,
        deployer,
        "1"
      );

      // Advance time
      await time.increaseTo(startTime + 60 * 60 * 2);

      // Stake tokenId
      await depositAndStake(
        mintResultA.tokenId.toString(),
        incentiveKey,
        bob.address,
        deployer,
        await proxy.getAddress()
      );

      let owner = await getDepositInfo(mintResultA.tokenId.toString());
      expect(owner).to.be.equal(deployer.address);

      // Try another stake
      const mintResultB = await mintPosition(
        token0,
        token1,
        18,
        18,
        "10",
        "0.0001",
        100,
        deployer,
        "1"
      );

      // Advance time
      await time.increaseTo(startTime + 60 * 60 * 4);

      // Stake tokenId
      await depositAndStake(
        mintResultB.tokenId.toString(),
        incentiveKey,
        bob.address,
        deployer,
        await proxy.getAddress()
      );

      owner = await getDepositInfo(mintResultB.tokenId.toString());
      expect(owner).to.be.equal(deployer.address);

      // Unstake
      await time.increaseTo(endTime - 60);

      expect(await referral.balanceOf(bob.address)).to.be.equal(0);
      for (const t of [mintResultA, mintResultB]) {
        await transferDeposit(t.tokenId, await proxy.getAddress());
        // Make deployer as recipient and check bob balance
        await unstake(
          t.tokenId.toString(),
          incentiveKey,
          await proxy.getAddress(),
          await referral.getAddress(),
          alice.address,
          deployer
        );
      }

      // Alice has gained all the timeframe rewards (incentiveAmount) plus all the self referral bonus (1.5%)
      const aliceRewardBal = ethers.formatEther(
        await referral.balanceOf(alice.address)
      );
      expect(+aliceRewardBal).to.be.greaterThan(+incentiveAmount);
      expect(+aliceRewardBal).to.be.lessThan(
        +incentiveAmount + +incentiveAmount * (15 / 1000)
      );

      // Bob gains referral amount (5% incentiveAmount)
      const bobRewardBal = ethers.formatEther(
        await referral.balanceOf(bob.address)
      );
      expect(+bobRewardBal).to.be.greaterThan(+incentiveAmount * (4 / 100));
      expect(+bobRewardBal).to.be.lessThan(+incentiveAmount * (5 / 100));
    });
  });
});
