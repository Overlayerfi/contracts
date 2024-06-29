import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { config, ethers, network } from "hardhat";
import { expect } from "chai";
import { getContractAddress } from "@ethersproject/address";
import {
  AUSDC_ADDRESS,
  AUSDT_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS
} from "../scripts/addresses";
import ERC20_ABI from "./ERC20_ABI.json";
import { swap } from "../scripts/get_stables_from_uniswap_local/swap";
import { Contract } from "ethers";
import Big from "big.js";

let swapped = false;

//NOTE: this test works only on ETH mainnet (0x1)
describe("USDOBacking", function () {
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
      //get usdc and usdt
      await swap("50", "25");
      swapped = true;
    }

    const [admin, gatekeeper, alice, bob] = await ethers.getSigners();

    const stableAmount = 10000;

    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, admin.provider);
    const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, admin.provider);
    const ausdc = new ethers.Contract(AUSDC_ADDRESS, ERC20_ABI, admin.provider);
    const ausdt = new ethers.Contract(AUSDT_ADDRESS, ERC20_ABI, admin.provider);

    const Usdo = await ethers.getContractFactory("USDOM");
    const usdo = await Usdo.deploy(
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
      ethers.parseEther("100000000"),
      { maxFeePerGas: 9702346660 }
    );

    //send some usdc and usdt to users
    await (usdc.connect(admin) as Contract).transfer(
      alice.address,
      ethers.parseUnits((stableAmount / 2).toString(), await usdc.decimals())
    );
    await (usdc.connect(admin) as Contract).transfer(
      bob.address,
      ethers.parseUnits((stableAmount / 2).toString(), await usdc.decimals())
    );
    await (usdt.connect(admin) as Contract).transfer(
      alice.address,
      ethers.parseUnits((stableAmount / 2).toString(), await usdt.decimals())
    );
    await (usdt.connect(admin) as Contract).transfer(
      bob.address,
      ethers.parseUnits((stableAmount / 2).toString(), await usdt.decimals())
    );

    await (usdc.connect(alice) as Contract).approve(
      await usdo.getAddress(),
      ethers.MaxUint256
    );
    await (usdc.connect(bob) as Contract).approve(
      await usdo.getAddress(),
      ethers.MaxUint256
    );
    await (usdt.connect(alice) as Contract).approve(
      await usdo.getAddress(),
      ethers.MaxUint256
    );
    await (usdt.connect(bob) as Contract).approve(
      await usdo.getAddress(),
      ethers.MaxUint256
    );

    const StakedUSDO = await ethers.getContractFactory("StakedUSDOFront");
    const susdo = await StakedUSDO.deploy(
      await usdo.getAddress(),
      admin.address,
      admin.address,
      0
    );

    await susdo.connect(admin).setCooldownDuration(0); // 0 days

    await usdo
      .connect(admin)
      .grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("COLLATERAL_MANAGER_ROLE")),
        admin.address
      );
    const USDOBackingNonce = (await admin.getNonce()) + 1;
    const futureAddress = getContractAddress({
      from: admin.address,
      nonce: USDOBackingNonce
    });
    await usdo.connect(admin).proposeNewCollateralSpender(futureAddress);

    const USDOBacking = await ethers.getContractFactory("USDOBacking");
    const usdobacking = await USDOBacking.deploy(
      admin.address,
      await usdo.getAddress(),
      await susdo.getAddress(),
      { maxFeePerGas: 9702346660 }
    );

    // Grant rewarder role
    await susdo
      .connect(admin)
      .grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("REWARDER_ROLE")),
        await usdobacking.getAddress()
      );

    //stake initial amount to avoid donation attack on staking contract
    const order = {
      benefactor: admin.address,
      beneficiary: admin.address,
      collateral_usdt: await usdt.getAddress(),
      collateral_usdc: await usdc.getAddress(),
      collateral_usdt_amount: ethers.parseUnits("0.5", await usdt.decimals()),
      collateral_usdc_amount: ethers.parseUnits("0.5", await usdc.decimals()),
      usdo_amount: ethers.parseEther("1")
    };
    await (usdc.connect(admin) as Contract).approve(
      await usdo.getAddress(),
      ethers.MaxUint256
    );
    await (usdt.connect(admin) as Contract).approve(
      await usdo.getAddress(),
      ethers.MaxUint256
    );
    await usdo.connect(admin).mint(order);
    await usdo
      .connect(admin)
      .approve(await susdo.getAddress(), ethers.MaxUint256);
    await susdo.connect(admin).deposit(ethers.parseEther("1"), admin.address);

    if (futureAddress !== (await usdobacking.getAddress())) {
      throw new Error("The predicted USDOBacking address is not valid");
    }

    return {
      usdc,
      usdt,
      ausdc,
      ausdt,
      usdo,
      susdo,
      usdobacking,
      admin,
      gatekeeper,
      alice,
      bob
    };
  }

  describe("Deployment", function () {
    it("Should set the admin", async function () {
      const { usdobacking, admin } = await loadFixture(deployFixture);
      expect(await usdobacking.owner()).to.equal(admin.address);
    });

    it("Should set USDO collateral spender", async function () {
      const { usdobacking, usdo } = await loadFixture(deployFixture);
      expect(await usdo.approvedCollateralSpender()).to.equal(
        await usdobacking.getAddress()
      );
    });
  });

  describe("AAVE change", function() {
    it("Should change AAVE contract", async function () {
      const { usdobacking, admin } = await loadFixture(deployFixture);
      expect(await usdobacking.AAVE()).to.be.equal("0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2");
      await usdobacking.proposeNewAave(admin.address);
      await time.increase(10 * 24 * 60 * 60);
      await usdobacking.connect(admin).acceptProposedAave();
      expect(await usdobacking.AAVE()).to.be.equal(admin.address);
    });
  });

  describe("Supply", function () {
    it("Should supply to backing", async function () {
      const { usdc, usdt, usdo, ausdc, ausdt, usdobacking, admin, alice, bob } =
        await loadFixture(deployFixture);
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits("995", await usdt.decimals()),
        collateral_usdc_amount: ethers.parseUnits("995", await usdc.decimals()),
        usdo_amount: ethers.parseEther("1990")
      };
      await usdo.connect(alice).mint(order);
      await expect(
        usdo.connect(admin).supplyToBacking()
      ).to.be.eventually.rejectedWith("SupplyAmountNotReached");
      const newOrder = {
        benefactor: bob.address,
        beneficiary: bob.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits(
          "1005",
          await usdt.decimals()
        ),
        collateral_usdc_amount: ethers.parseUnits(
          "1005",
          await usdc.decimals()
        ),
        usdo_amount: ethers.parseEther("2010")
      };
      await usdo.connect(bob).mint(newOrder);
      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("2000.5", await usdc.decimals())
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("2000.5", await usdt.decimals())
      );
      expect(await usdo.connect(bob).supplyToBacking()).to.emit(
        usdo,
        "SuppliedToBacking"
      );
      expect(await ausdc.balanceOf(await usdobacking.getAddress())).to.be.equal(
        ethers.parseUnits("2000", await ausdc.decimals())
      );
      expect(await ausdt.balanceOf(await usdobacking.getAddress())).to.be.equal(
        ethers.parseUnits("2000", await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDC()).to.be.equal(
        ethers.parseUnits("2000", await usdc.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits("2000", await usdt.decimals())
      );
    });
  });

  describe("Redeem", function () {
    it("Should redeem", async function () {
      const { usdc, usdt, usdo, alice } = await loadFixture(deployFixture);
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
      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("10.5", await usdc.decimals())
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("10.5", await usdt.decimals())
      );
      expect(await usdc.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits("4990", await usdc.decimals())
      );
      expect(await usdt.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits("4990", await usdc.decimals())
      );
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther("20")
      );
      await usdo.connect(alice).redeem(order);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(0);
      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(500000);
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(500000);
      expect(await usdc.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits("5000", await usdc.decimals())
      );
      expect(await usdt.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits("5000", await usdc.decimals())
      );
      expect(await usdo.balanceOf(alice.address)).to.be.equal(0);
    });

    it("Should withdraw from backing", async function () {
      const { usdc, usdt, usdo, ausdc, ausdt, usdobacking, alice } =
        await loadFixture(deployFixture);
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits(
          "1100",
          await usdt.decimals()
        ),
        collateral_usdc_amount: ethers.parseUnits(
          "1100",
          await usdc.decimals()
        ),
        usdo_amount: ethers.parseEther("2200")
      };
      await usdo.connect(alice).mint(order);
      await usdo.connect(alice).supplyToBacking();
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther("2200")
      );
      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("100.5", await usdc.decimals())
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("100.5", await usdt.decimals())
      );
      expect(await ausdc.balanceOf(await usdobacking.getAddress())).to.be.equal(
        ethers.parseUnits("1000", await ausdc.decimals())
      );
      expect(await ausdt.balanceOf(await usdobacking.getAddress())).to.be.equal(
        ethers.parseUnits("1000", await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDC()).to.be.equal(
        ethers.parseUnits("1000", await usdc.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits("1000", await usdt.decimals())
      );

      const redeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits("500", await usdt.decimals()),
        collateral_usdc_amount: ethers.parseUnits("500", await usdc.decimals()),
        usdo_amount: ethers.parseEther("1000")
      };
      await usdo.connect(alice).redeem(redeemOrder);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther("1200")
      );
      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdobacking.totalSuppliedUSDC()).to.be.equal(
        ethers.parseUnits("600.5", await usdc.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits("600.5", await usdt.decimals())
      );
      //################################################################################################################################################
      //account yield for aToken -> use greaterThanOrEqual
      expect(
        await ausdc.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits("600", await ausdc.decimals())
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits("600", await ausdt.decimals())
      );
      //################################################################################################################################################

      //remove all collateral
      const secondRedeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits("600", await usdt.decimals()),
        collateral_usdc_amount: ethers.parseUnits("600", await usdc.decimals()),
        usdo_amount: ethers.parseEther("1200")
      };
      const ausdcBefore = ethers.formatUnits(
        await ausdc.balanceOf(await usdobacking.getAddress()),
        await ausdc.decimals()
      );
      const ausdtBefore = ethers.formatUnits(
        await ausdt.balanceOf(await usdobacking.getAddress()),
        await ausdt.decimals()
      );
      await usdo.connect(alice).redeem(secondRedeemOrder);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(0);
      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdobacking.totalSuppliedUSDC()).to.be.equal(500000);
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(500000);
      //################################################################################################################################################
      //account yield for aToken -> use greaterThanOrEqual
      const ausdcAfter = ethers.formatUnits(
        await ausdc.balanceOf(await usdobacking.getAddress()),
        await ausdc.decimals()
      );
      const ausdtAfter = ethers.formatUnits(
        await ausdt.balanceOf(await usdobacking.getAddress()),
        await ausdt.decimals()
      );
      expect(+ausdcAfter + 600).to.be.greaterThanOrEqual(+ausdcBefore);
      expect(+ausdtAfter + 600).to.be.greaterThanOrEqual(+ausdtBefore);
      //################################################################################################################################################
    });
  });

  describe("Coumpound (Integration test)", function () {
    it("Should mint new USDO and split between recipients", async function () {
      const {
        usdc,
        usdt,
        usdo,
        susdo,
        ausdc,
        ausdt,
        usdobacking,
        admin,
        alice
      } = await loadFixture(deployFixture);
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits(
          "1000",
          await usdt.decimals()
        ),
        collateral_usdc_amount: ethers.parseUnits(
          "1000",
          await usdc.decimals()
        ),
        usdo_amount: ethers.parseEther("2000")
      };
      await usdo.connect(alice).mint(order);
      await usdo.connect(alice).supplyToBacking();

      const ausdcBefore = ethers.formatUnits(
        await ausdc.balanceOf(await usdobacking.getAddress()),
        await ausdc.decimals()
      );
      const ausdtBefore = ethers.formatUnits(
        await ausdt.balanceOf(await usdobacking.getAddress()),
        await ausdt.decimals()
      );
      //advance time
      await time.increase(12 * 30 * 24 * 60 * 60); //12 months
      const ausdcAfter = ethers.formatUnits(
        await ausdc.balanceOf(await usdobacking.getAddress()),
        await ausdc.decimals()
      );
      const ausdtAfter = ethers.formatUnits(
        await ausdt.balanceOf(await usdobacking.getAddress()),
        await ausdt.decimals()
      );

      const diffUsdc = new Big(ausdcAfter).minus(ausdcBefore);
      const diffUsdt = new Big(ausdtAfter).minus(ausdtBefore);
      let minDiff = new Big(0);
      if (diffUsdc.lte(diffUsdt)) {
        minDiff = diffUsdc;
      } else {
        minDiff = diffUsdt;
      }

      //test to fixed 2 decimals
      await usdobacking.connect(admin).compound();
      const teamRewardAllocation = ethers.formatEther(
        await usdo.balanceOf(admin.address)
      );
      expect((+teamRewardAllocation).toFixed(2)).to.be.equal(
        minDiff.mul(20).div(100).toFixed(2)
      );

      const expectedStakingAssets = minDiff.mul(80).div(100).plus(1).toFixed(2);
      const realStakingAssets = (+ethers.formatEther(
        await susdo.totalAssets()
      )).toFixed(2);
      expect(realStakingAssets).to.be.equal(expectedStakingAssets);
    });
  });
});
