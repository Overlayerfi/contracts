import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { config, ethers, network } from "hardhat";
import { expect } from "chai";
import { getContractAddress } from "@ethersproject/address";
import {
  AUSDC_ADDRESS,
  AUSDT_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS,
  AWETH_ADDRESS
} from "../scripts/addresses";
import ERC20_ABI from "./ERC20_ABI.json";
import { swap } from "../scripts/uniswap_swapper/proxy";
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

    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, admin.provider);
    const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, admin.provider);
    const ausdc = new ethers.Contract(AUSDC_ADDRESS, ERC20_ABI, admin.provider);
    const ausdt = new ethers.Contract(AUSDT_ADDRESS, ERC20_ABI, admin.provider);
    const aweth = new ethers.Contract(AWETH_ADDRESS, ERC20_ABI, admin.provider);

    const Usdo = await ethers.getContractFactory("USDO");
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
      {
        addr: await ausdc.getAddress(),
        decimals: await ausdc.decimals()
      },
      {
        addr: await ausdt.getAddress(),
        decimals: await ausdt.decimals()
      },
      ethers.parseEther("100000000"),
      ethers.parseEther("100000000"),
      defaultTransactionOptions
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
      admin.address,
      await usdo.getAddress(),
      await susdo.getAddress()
      //{ maxFeePerGas: 9702346660 }
    );

    // Grant rewarder role
    await susdo
      .connect(admin)
      .grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("REWARDER_ROLE")),
        await usdobacking.getAddress()
      );

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

    //stake initial amount to avoid donation attack on staking contract
    await susdo.connect(admin).deposit(ethers.parseEther("1"), admin.address);

    if (futureAddress !== (await usdobacking.getAddress())) {
      throw new Error("The predicted USDOBacking address is not valid");
    }

    return {
      usdc,
      usdt,
      ausdc,
      ausdt,
      aweth,
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
      expect(await usdo.getSpender()).to.equal(await usdobacking.getAddress());
    });
  });

  describe("AAVE change", function () {
    it("Should change AAVE contract", async function () {
      const { usdobacking, admin } = await loadFixture(deployFixture);
      await usdobacking.proposeNewAave(admin.address);
      await time.increase(10 * 24 * 60 * 60);
      expect(await usdobacking.connect(admin).acceptProposedAave()).to.emit(
        usdobacking,
        "AaveNewAaave"
      );
    });
  });

  describe("Team allocation change", function () {
    it("Should change team allocation points", async function () {
      const { usdobacking, admin } = await loadFixture(deployFixture);
      await usdobacking.proposeNewTeamAllocation(10);
      await time.increase(10 * 24 * 60 * 60);
      expect(
        await usdobacking.connect(admin).acceptProposedTeamAllocation()
      ).to.emit(usdobacking, "AaveNewTeamAllocation");
    });
  });

  describe("Dispatcher change", function () {
    it("Should change team dispatcher address", async function () {
      const { usdobacking, admin, alice } = await loadFixture(deployFixture);
      expect(
        await usdobacking.connect(admin).updateRewardsDispatcher(alice.address)
      ).to.emit(usdobacking, "AaveNewTreasury");
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
      // Supply zero amounts
      expect(await usdo.connect(bob).supplyToBacking()).to.emit(
        usdo,
        "SuppliedToBacking"
      );
      expect(
        await ausdc.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits("2000.5", await ausdc.decimals())
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits("2000.5", await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDC()).to.be.equal(
        ethers.parseUnits("2000.5", await usdc.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits("2000.5", await usdt.decimals())
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

    it("Should redeem aToken in emergency", async function () {
      const { ausdc, ausdt, usdc, usdt, usdo, alice, admin, usdobacking } =
        await loadFixture(deployFixture);
      let order = {
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
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther("20")
      );

      await time.increase(60 * 60 * 24 * 30);

      // No assets in USDO
      await usdo.connect(alice).supplyToBacking();
      // Supply zero amounts
      await usdo.connect(alice).supplyToBacking();
      await usdo.connect(admin).setEmergencyStatus(true);

      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits("10", await usdt.decimals())
      );
      expect(
        await ausdc.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits("10", await usdc.decimals())
      );

      const aliceUsdcBeforeBal = await usdc.balanceOf(alice.address);
      const aliceUsdtBeforeBal = await usdt.balanceOf(alice.address);
      expect(await ausdc.balanceOf(alice.address)).to.be.equal(0);
      expect(await ausdt.balanceOf(alice.address)).to.be.equal(0);
      order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await ausdt.getAddress(),
        collateral_usdc: await ausdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits("10", await ausdt.decimals()),
        collateral_usdc_amount: ethers.parseUnits("10", await ausdc.decimals()),
        usdo_amount: ethers.parseEther("20")
      };
      await usdo.connect(alice).redeem(order);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(0);
      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdc.balanceOf(alice.address)).to.be.equal(
        aliceUsdcBeforeBal
      );
      expect(await usdt.balanceOf(alice.address)).to.be.equal(
        aliceUsdtBeforeBal
      );
      expect(await usdo.balanceOf(alice.address)).to.be.equal(0);
      expect(await ausdc.balanceOf(alice.address)).to.be.greaterThanOrEqual(
        ethers.parseUnits("10", await ausdc.decimals())
      );
      expect(await ausdt.balanceOf(alice.address)).to.be.greaterThanOrEqual(
        ethers.parseUnits("10", await ausdt.decimals())
      );
      // Given back all
      expect(await usdobacking.totalSuppliedUSDC()).be.equal(
        ethers.parseUnits("0.5", await ausdc.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).be.equal(
        ethers.parseUnits("0.5", await ausdc.decimals())
      );
    });

    it("Donation should not influence", async function () {
      const { admin, usdc, usdt, usdo, ausdc, ausdt, usdobacking, alice, bob } =
        await loadFixture(deployFixture);

      await usdc
        .connect(admin)
        .transfer(bob.address, ethers.parseUnits("100", 6));

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
      // Donate
      await usdc
        .connect(bob)
        .transfer(await usdo.getAddress(), ethers.parseUnits("50", 6));
      // The donation above should only forward assets to the backing contract without modifing the supplied stable coins trakcer
      await usdo.connect(bob).supplyToBacking();
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther("2000")
      );
      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("0", await usdc.decimals())
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("0", await usdt.decimals())
      );
      expect(
        await ausdc.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits("1050.5", await ausdc.decimals())
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits("1000.5", await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDC()).to.be.equal(
        ethers.parseUnits("1000.5", await usdc.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits("1000.5", await usdt.decimals())
      );

      // Donate
      await usdc
        .connect(bob)
        .transfer(await usdo.getAddress(), ethers.parseUnits("50", 6));
      await usdo.connect(bob).supplyToBacking();

      const redeemOrder = {
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
      await usdo.connect(alice).redeem(redeemOrder);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther("0")
      );
      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      // Donation should not influence the supplied usdc and usdt accounting
      expect(await usdobacking.totalSuppliedUSDC()).to.be.equal(
        ethers.parseUnits("0.5", await usdc.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits("0.5", await usdt.decimals())
      );
      //################################################################################################################################################
      //account yield for aToken -> use greaterThanOrEqual
      expect(
        await ausdc.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits("100.5", await ausdc.decimals())
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits("0.5", await ausdt.decimals())
      );
      // Initial amount
      expect(await usdo.totalSupply()).to.be.equal(ethers.parseEther("1"));
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
        ethers.parseUnits("0", await usdc.decimals())
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("0", await usdt.decimals())
      );
      expect(await ausdc.balanceOf(await usdobacking.getAddress())).to.be.equal(
        ethers.parseUnits("1100.5", await ausdc.decimals())
      );
      expect(await ausdt.balanceOf(await usdobacking.getAddress())).to.be.equal(
        ethers.parseUnits("1100.5", await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDC()).to.be.equal(
        ethers.parseUnits("1100.5", await usdc.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits("1100.5", await usdt.decimals())
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
        ethers.parseUnits("600.5", await ausdc.decimals())
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits("600.5", await ausdt.decimals())
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

    it("Should withdraw from backing aToken", async function () {
      const { usdc, usdt, usdo, ausdc, ausdt, usdobacking, alice, admin } =
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
        ethers.parseUnits("0", await usdc.decimals())
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("0", await usdt.decimals())
      );
      expect(await ausdc.balanceOf(await usdobacking.getAddress())).to.be.equal(
        ethers.parseUnits("1100.5", await ausdc.decimals())
      );
      expect(await ausdt.balanceOf(await usdobacking.getAddress())).to.be.equal(
        ethers.parseUnits("1100.5", await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDC()).to.be.equal(
        ethers.parseUnits("1100.5", await usdc.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits("1100.5", await usdt.decimals())
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
        ethers.parseUnits("600.5", await ausdc.decimals())
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits("600.5", await ausdt.decimals())
      );
      //################################################################################################################################################

      await usdo.connect(alice).supplyToBacking();
      await usdo.connect(admin).setEmergencyStatus(true);

      expect(await ausdc.balanceOf(alice.address)).to.be.equal(0);
      expect(await ausdt.balanceOf(alice.address)).to.be.equal(0);

      //remove all collateral
      const secondRedeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await ausdt.getAddress(),
        collateral_usdc: await ausdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits(
          "600",
          await ausdt.decimals()
        ),
        collateral_usdc_amount: ethers.parseUnits(
          "600",
          await ausdc.decimals()
        ),
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
      expect(await ausdt.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits("600", await ausdt.decimals())
      );
      expect(await ausdc.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits("600", await ausdc.decimals())
      );
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

    it("Should mint new USDO and split between recipients in emergency mode", async function () {
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

      const beforeEmergencyTeamAllocation = await usdo.balanceOf(admin.address);
      expect(await ausdc.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await ausdt.balanceOf(await usdo.getAddress())).to.be.equal(0);

      await usdo.connect(admin).supplyToBacking();
      await usdo.connect(admin).setEmergencyStatus(true);
      await time.increase(2 * 24 * 60 * 60); //2 days
      await usdobacking.connect(admin).compound();

      expect(await usdo.balanceOf(admin.address)).to.be.greaterThanOrEqual(
        beforeEmergencyTeamAllocation
      );
      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await ausdc.balanceOf(await usdo.getAddress())).to.be.greaterThan(
        0
      );
      expect(await ausdt.balanceOf(await usdo.getAddress())).to.be.greaterThan(
        0
      );
    });
  });

  describe("Admin emergency ops", function () {
    it("adminWithdraw - should unstake from AAVE and return user funds to protocol", async function () {
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
      expect(await usdo.connect(bob).supplyToBacking()).to.emit(
        usdo,
        "SuppliedToBacking"
      );
      expect(await ausdc.balanceOf(await usdobacking.getAddress())).to.be.equal(
        ethers.parseUnits("2000.5", await ausdc.decimals())
      );
      expect(await ausdt.balanceOf(await usdobacking.getAddress())).to.be.equal(
        ethers.parseUnits("2000.5", await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDC()).to.be.equal(
        ethers.parseUnits("2000.5", await usdc.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits("2000.5", await usdt.decimals())
      );
      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);

      await time.increase(12 * 30 * 24 * 60 * 60); //12 months

      let usdcBal = await ausdc.balanceOf(await usdobacking.getAddress());
      let usdtBal = await ausdt.balanceOf(await usdobacking.getAddress());
      const big_usdcBal = new Big(usdcBal);
      const big_usdtBal = new Big(usdtBal);
      const minAmount = big_usdcBal.lt(big_usdtBal) ? usdcBal : usdtBal;
      await usdobacking.connect(admin).adminWithdraw(minAmount, minAmount);

      expect(await usdc.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("2000.5", await usdt.decimals())
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("2000.5", await usdt.decimals())
      );
    });

    it("adminSwapPosition - should move stable coins position into WETH position", async function () {
      const { usdc, usdt, usdo, usdobacking, admin, alice, aweth } =
        await loadFixture(deployFixture);
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral_usdt: await usdt.getAddress(),
        collateral_usdc: await usdc.getAddress(),
        collateral_usdt_amount: ethers.parseUnits(
          "2100",
          await usdt.decimals()
        ),
        collateral_usdc_amount: ethers.parseUnits(
          "2100",
          await usdc.decimals()
        ),
        usdo_amount: ethers.parseEther("4200")
      };
      await usdo.connect(alice).mint(order);
      expect(await usdo.connect(alice).supplyToBacking()).to.emit(
        usdo,
        "SuppliedToBacking"
      );

      await time.increase(12 * 30 * 24 * 60 * 60); //12 months

      await usdobacking.connect(admin).proposeEmergencyTime();
      await time.increase(0.5 * 30 * 24 * 60 * 60); //0.5 months
      await expect(usdobacking.connect(admin).adminSwapPosition()).to.be
        .eventually.rejected;
      await time.increase(0.5 * 30 * 24 * 60 * 60 + 1); //0.5 months
      await usdobacking.connect(admin).adminSwapPosition();
      const beforeBalance = await aweth.balanceOf(admin.address);
      expect(beforeBalance).is.greaterThan(0);

      // Try some rewards
      await time.increase(12 * 30 * 24 * 60 * 60); //12 months
      expect(await aweth.balanceOf(admin.address)).is.greaterThan(
        beforeBalance
      );
    });
  });
});
