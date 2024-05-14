import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { executionAsyncId } from "async_hooks";

describe("StakingRewardsDistributor", function () {
  async function deployFixture() {
    const [admin, operator] = await ethers.getSigners();

    const Usdc = await ethers.getContractFactory("SixDecimalsUsd");
    const usdc = await Usdc.deploy(100, "USDC", "USDC");

    const Usdt = await ethers.getContractFactory("FixedSupplyERC20");
    const usdt = await Usdt.deploy(100, "USDT", "USDT");

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

    const StakedUSDO = await ethers.getContractFactory("StakedUSDOFront");
    const stakedusdo = await StakedUSDO.deploy(
      await usdo.getAddress(),
      admin.address,
      admin.address,
      0
    );

    const Stakingrewardsdistributor = await ethers.getContractFactory(
      "StakingRewardsDistributor"
    );
    const stakingrewardsdistributor = await Stakingrewardsdistributor.deploy(
      await stakedusdo.getAddress(),
      await usdo.getAddress(),
      await usdc.getAddress(),
      await usdt.getAddress(),
      admin.address,
      operator.address
    );

    // Admin send USDC and USDT to reward distributor
    await usdc
      .connect(admin)
      .transfer(
        await stakingrewardsdistributor.getAddress(),
        ethers.parseUnits("90", await usdc.decimals())
      );
    await usdt
      .connect(admin)
      .transfer(
        await stakingrewardsdistributor.getAddress(),
        ethers.parseUnits("90", await usdt.decimals())
      );

    // Grant rewarder role
    await stakedusdo
      .connect(admin)
      .grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("REWARDER_ROLE")),
        await stakingrewardsdistributor.getAddress()
      );

    return {
      admin,
      operator,
      usdc,
      usdt,
      usdo,
      stakedusdo,
      stakingrewardsdistributor
    };
  }

  describe("Deployment", function () {
    it("Should set the owner and operator", async function () {
      const { admin, operator, stakingrewardsdistributor } = await loadFixture(
        deployFixture
      );
      expect(await stakingrewardsdistributor.owner()).to.equal(admin.address);
      expect(await stakingrewardsdistributor.operator()).to.equal(
        operator.address
      );
    });
  });

  describe("Rescue", function () {
    it("Should rescue token", async function () {
      const { admin, usdc, stakingrewardsdistributor } = await loadFixture(
        deployFixture
      );
      await expect(
        await stakingrewardsdistributor
          .connect(admin)
          .rescueTokens(
            await usdc.getAddress(),
            admin.address,
            await usdc.balanceOf(await stakingrewardsdistributor.getAddress())
          )
      ).to.emit(stakingrewardsdistributor, "TokensRescued");
      expect(await usdc.balanceOf(admin.address)).to.equal(
        ethers.parseUnits("100", await usdc.decimals())
      );
    });

    it("Should not rescue token if not owner", async function () {
      const { admin, operator, usdc, stakingrewardsdistributor } =
        await loadFixture(deployFixture);
      await expect(
        stakingrewardsdistributor
          .connect(operator)
          .rescueTokens(
            await usdc.getAddress(),
            admin.address,
            await usdc.balanceOf(await stakingrewardsdistributor.getAddress())
          )
      ).to.be.eventually.rejectedWith("OwnableUnauthorizedAccount");
    });
  });

  describe("Revoke Approvals", function () {
    it("Should revoke approvals to USDC and USDT", async function () {
      const { admin, usdc, usdt, usdo, stakingrewardsdistributor } =
        await loadFixture(deployFixture);
      const assets = [await usdc.getAddress(), await usdt.getAddress()];
      expect(
        await usdc.allowance(
          await stakingrewardsdistributor.getAddress(),
          await usdo.getAddress()
        )
      ).to.equal(ethers.MaxUint256);
      expect(
        await usdt.allowance(
          await stakingrewardsdistributor.getAddress(),
          await usdo.getAddress()
        )
      ).to.equal(ethers.MaxUint256);
      await stakingrewardsdistributor
        .connect(admin)
        .revokeApprovals(assets, await usdo.getAddress());
      expect(
        await usdt.allowance(
          await stakingrewardsdistributor.getAddress(),
          await usdo.getAddress()
        )
      ).to.equal(0);
      expect(
        await usdc.allowance(
          await stakingrewardsdistributor.getAddress(),
          await usdo.getAddress()
        )
      ).to.equal(0);
    });
  });

  describe("Transfer Rewards", function () {
    it("Should transfer in rewards by operator", async function () {
      const {
        admin,
        operator,
        usdc,
        usdt,
        usdo,
        stakedusdo,
        stakingrewardsdistributor
      } = await loadFixture(deployFixture);
      await stakingrewardsdistributor
        .connect(operator)
        .transferInRewards(
          ethers.parseUnits("50", await usdc.decimals()),
          ethers.parseUnits("50", await usdt.decimals()),
          ethers.parseEther("100")
        );
      // usdo's USDT and USDC are maintained inside the contract as defined by Obsidia protocol
      expect(await usdc.balanceOf(await usdo.getAddress())).to.equal(
        ethers.parseUnits("50", await usdc.decimals())
      );
      expect(await usdt.balanceOf(usdo.getAddress())).to.equal(
        ethers.parseUnits("50", await usdt.decimals())
      );
      expect(await stakedusdo.totalAssets()).to.equal(ethers.parseEther("100"));
    });

    it("Should not transfer in rewards by not an operator", async function () {
      const {
        admin,
        operator,
        usdc,
        usdt,
        usdo,
        stakedusdo,
        stakingrewardsdistributor
      } = await loadFixture(deployFixture);
      await expect(
        stakingrewardsdistributor
          .connect(admin)
          .transferInRewards(
            ethers.parseUnits("50", await usdc.decimals()),
            ethers.parseUnits("50", await usdt.decimals()),
            ethers.parseEther("100")
          )
      ).to.be.eventually.rejectedWith("OnlyOperator");
    });
  });
});
