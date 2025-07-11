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

    const Usdo = await ethers.getContractFactory("USDO");
    const usdo = await Usdo.deploy(
      await admin.getAddress(),
      {
        addr: await usdt.getAddress(),
        decimals: await usdt.decimals()
      },
      {
        addr: await ausdt.getAddress(),
        decimals: await ausdt.decimals()
      },
      ethers.parseEther("100000000"),
      ethers.parseEther("100000000"),
      defaultTransactionOptions
    );

    const Dispatcher = await ethers.getContractFactory("OvaDispatcher");
    const dispatcher = await Dispatcher.deploy(
      admin.address,
      admin.address,
      admin.address,
      admin.address,
      await usdo.getAddress(),
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
      await dispatcher.getAddress(),
      await usdo.getAddress(),
      await susdo.getAddress(),
      defaultTransactionOptions
    );

    await susdo.connect(admin).setUsdoBacking(await usdobacking.getAddress());

    // Grant rewarder role
    await susdo
      .connect(admin)
      .grantRole(
        ethers.keccak256(ethers.toUtf8Bytes("REWARDER_ROLE")),
        await usdobacking.getAddress()
      );

    const initialCollateralAmount = '1'

    const order = {
      benefactor: admin.address,
      beneficiary: admin.address,
      collateral: await usdt.getAddress(),
      collateral_amount: ethers.parseUnits(initialCollateralAmount, await usdt.decimals()),
      usdo_amount: ethers.parseEther(initialCollateralAmount)
    };
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
      usdt,
      ausdt,
      aweth,
      usdo,
      susdo,
      usdobacking,
      admin,
      gatekeeper,
      alice,
      bob,
      dispatcher,
      initialCollateralAmount
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
      await usdobacking.proposeNewOvaDispatcherAllocation(10);
      await time.increase(10 * 24 * 60 * 60);
      expect(
        await usdobacking.connect(admin).acceptProposedOvaDispatcherAllocation()
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
      const {  usdt, usdo,  ausdt, usdobacking, initialCollateralAmount, alice, bob } =
        await loadFixture(deployFixture);
      const amount1 = '1990'
      const amount2 = '2010'
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(amount1, await usdt.decimals()),
        usdo_amount: ethers.parseEther(amount1)
      };
      await usdo.connect(alice).mint(order);
      const newOrder = {
        benefactor: bob.address,
        beneficiary: bob.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(
          amount2,
          await usdt.decimals()
        ),
        usdo_amount: ethers.parseEther(amount2)
      };
      await usdo.connect(bob).mint(newOrder);
      const totalCollateral = (+amount1 + +amount2 + +initialCollateralAmount).toFixed(2)
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits(totalCollateral, await usdt.decimals())
      );
      expect(await usdo.connect(bob).supplyToBacking(0)).to.emit(
        usdo,
        "SuppliedToBacking"
      );
      // Supply zero amounts
      expect(await usdo.connect(bob).supplyToBacking(0)).to.emit(
        usdo,
        "SuppliedToBacking"
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(totalCollateral, await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(totalCollateral, await usdt.decimals())
      );
    });
  });

  describe("Redeem", function () {
    it("Should redeem", async function () {
      const {  usdt, usdo, alice, initialCollateralAmount } = await loadFixture(deployFixture);
      const amount = '10'
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(amount, await usdt.decimals()),
        usdo_amount: ethers.parseEther(amount)
      };
      await usdo.connect(alice).mint(order);
      const totalCollateral = (+amount + +initialCollateralAmount).toFixed(2)
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits(totalCollateral, await usdt.decimals())
      );
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther(amount)
      );
      await usdo.connect(alice).redeem(order);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(0);
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(ethers.parseUnits(initialCollateralAmount, await usdt.decimals()));
      expect(await usdt.balanceOf(alice.address)).to.be.equal(
        ethers.parseUnits("5000", await usdt.decimals())
      );
      expect(await usdo.balanceOf(alice.address)).to.be.equal(0);
    });

    it("Should redeem aToken in emergency", async function () {
      const {  ausdt,  usdt, usdo, alice, admin, usdobacking, initialCollateralAmount } =
        await loadFixture(deployFixture);
      const amount = '10'
      let order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(amount, await usdt.decimals()),
        usdo_amount: ethers.parseEther(amount)
      };
      const totalCollateral = (+amount + +initialCollateralAmount).toFixed(2)
      await usdo.connect(alice).mint(order);
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits(totalCollateral, await usdt.decimals())
      );

      await time.increase(60 * 60 * 24 * 30);

      // No assets in USDO
      await usdo.connect(alice).supplyToBacking( 0);
      // Supply zero amounts
      await usdo.connect(alice).supplyToBacking( 0);
      await usdo.connect(admin).setEmergencyStatus(true);

      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(totalCollateral, await usdt.decimals())
      );

      const aliceUsdtBeforeBal = await usdt.balanceOf(alice.address);
      expect(await ausdt.balanceOf(alice.address)).to.be.equal(0);
      order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await ausdt.getAddress(),
        collateral_amount: ethers.parseUnits(amount, await ausdt.decimals()),
        usdo_amount: ethers.parseEther(amount)
      };
      await usdo.connect(alice).redeem(order);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(0);
      // All collateral is in aToken
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdt.balanceOf(alice.address)).to.be.equal(
        aliceUsdtBeforeBal
      );
      expect(await usdo.balanceOf(alice.address)).to.be.equal(0);
      expect(await ausdt.balanceOf(alice.address)).to.be.greaterThanOrEqual(
        ethers.parseUnits(amount, await ausdt.decimals())
      );
      // Given back all
      expect(await usdobacking.totalSuppliedUSDT()).be.equal(
        ethers.parseUnits(initialCollateralAmount, await ausdt.decimals())
      );
    });

    it("Donation should not influence", async function () {
      const { admin,  usdt, usdo,  ausdt, usdobacking, alice, bob, initialCollateralAmount } =
        await loadFixture(deployFixture);

      await usdt
        .connect(admin)
        .transfer(bob.address, ethers.parseUnits("100", 6));

      const amount = '1000'
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(
          amount,
          await usdt.decimals()
        ),
        usdo_amount: ethers.parseEther(amount)
      };
      await usdo.connect(alice).mint(order);
      await usdo.connect(alice).supplyToBacking( 0);
      // Donate
      const donationAmount = '50'
      await usdt
        .connect(bob)
        .transfer(await usdo.getAddress(), ethers.parseUnits(donationAmount, 6));
      // The donation above should only forward assets to the backing contract without modifing the supplied stable coins trakcer
      await usdo.connect(bob).supplyToBacking(0);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther(amount)
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("0", await usdt.decimals())
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits((+amount + +donationAmount + +initialCollateralAmount).toFixed(2), await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits((+amount + +initialCollateralAmount).toFixed(2), await usdt.decimals())
      );

      // Donate
      await usdt
        .connect(bob)
        .transfer(await usdo.getAddress(), ethers.parseUnits(donationAmount, 6));
      await usdo.connect(bob).supplyToBacking( 0);

      const redeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(
          amount,
          await usdt.decimals()
        ),
        usdo_amount: ethers.parseEther(amount)
      };
      await usdo.connect(alice).redeem(redeemOrder);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther("0")
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      // Donation should not influence the supplied usdt and usdt accounting
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits(initialCollateralAmount, await usdt.decimals())
      );
      //################################################################################################################################################
      //account yield for aToken -> use greaterThanOrEqual
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits((+donationAmount + +donationAmount + +initialCollateralAmount).toFixed(2), await ausdt.decimals()) // We donated 2 times
      );
      // Initial amount
      expect(await usdo.totalSupply()).to.be.equal(ethers.parseEther(initialCollateralAmount));
    });

    it("Should withdraw from backing", async function () {
      const {  usdt, usdo,  ausdt, usdobacking, alice, initialCollateralAmount } =
        await loadFixture(deployFixture);
      const amount = '1000'
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(
          amount,
          await usdt.decimals()
        ),
        usdo_amount: ethers.parseEther(amount)
      };
      await usdo.connect(alice).mint(order);
      await usdo.connect(alice).supplyToBacking(0);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther(amount)
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("0", await usdt.decimals())
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits((+amount + +initialCollateralAmount * 0.99).toFixed(6), await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits((+amount + +initialCollateralAmount).toFixed(2), await usdt.decimals())
      );

      const redeemAmount = '500'
      const redeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(redeemAmount, await usdt.decimals()),
        usdo_amount: ethers.parseEther(redeemAmount)
      };
      await usdo.connect(alice).redeem(redeemOrder);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther((+amount - +redeemAmount).toFixed(1))
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits((+amount - +redeemAmount + +initialCollateralAmount).toFixed(2), await usdt.decimals())
      );
      //################################################################################################################################################
      //account yield for aToken -> use greaterThanOrEqual
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits((+amount - +redeemAmount + +initialCollateralAmount).toFixed(2), await ausdt.decimals())
      );
      //################################################################################################################################################

      //remove all collateral
      const secondRedeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(redeemAmount, await usdt.decimals()),
        usdo_amount: ethers.parseEther(redeemAmount)
      };
      const ausdtBefore = ethers.formatUnits(
        await ausdt.balanceOf(await usdobacking.getAddress()),
        await ausdt.decimals()
      );
      await usdo.connect(alice).redeem(secondRedeemOrder);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(0);
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(ethers.parseUnits(initialCollateralAmount, await usdt.decimals()));
      //################################################################################################################################################
      //account yield for aToken -> use greaterThanOrEqual
      const ausdtAfter = ethers.formatUnits(
        await ausdt.balanceOf(await usdobacking.getAddress()),
        await ausdt.decimals()
      );
      expect(+ausdtAfter + +redeemAmount).to.be.greaterThanOrEqual(+ausdtBefore);
      //################################################################################################################################################
    });

    it("Should withdraw from backing aToken", async function () {
      const {  usdt, usdo,  ausdt, usdobacking, alice, admin, initialCollateralAmount } =
        await loadFixture(deployFixture);
      const amount = '1000'
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(
          amount,
          await usdt.decimals()
        ),
        usdo_amount: ethers.parseEther(amount)
      };
      await usdo.connect(alice).mint(order);
      await usdo.connect(alice).supplyToBacking( 0);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther(amount)
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits("0", await usdt.decimals())
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits((+amount + +initialCollateralAmount * 0.99).toFixed(6), await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits((+amount + +initialCollateralAmount).toFixed(2), await usdt.decimals())
      );

      const redeemAmount = '500'
      const redeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(redeemAmount, await usdt.decimals()),
        usdo_amount: ethers.parseEther(redeemAmount)
      };
      await usdo.connect(alice).redeem(redeemOrder);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(
        ethers.parseEther((+amount - +redeemAmount).toFixed(1))
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits((+amount - +redeemAmount + +initialCollateralAmount).toFixed(1), await usdt.decimals())
      );
      //################################################################################################################################################
      //account yield for aToken -> use greaterThanOrEqual
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits((+amount - +redeemAmount + +initialCollateralAmount).toFixed(1), await ausdt.decimals())
      );
      //################################################################################################################################################

      await usdo.connect(alice).supplyToBacking(0);
      await usdo.connect(admin).setEmergencyStatus(true);

      expect(await ausdt.balanceOf(alice.address)).to.be.equal(0);

      //remove all collateral
      const secondRedeemOrder = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await ausdt.getAddress(),
        collateral_amount: ethers.parseUnits(
          (+amount - +redeemAmount).toFixed(1),
          await ausdt.decimals()
        ),
        usdo_amount: ethers.parseEther((+amount - +redeemAmount).toFixed(1))
      };
      const ausdtBefore = ethers.formatUnits(
        await ausdt.balanceOf(await usdobacking.getAddress()),
        await ausdt.decimals()
      );
      // expect(ausdtBefore).to.be.equal(0);
      await usdo.connect(alice).redeem(secondRedeemOrder);
      expect(await usdo.balanceOf(alice.address)).to.be.equal(0);
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(ethers.parseUnits(initialCollateralAmount, await usdt.decimals()));
      expect(await ausdt.balanceOf(alice.address)).to.be.greaterThanOrEqual(
        ethers.parseUnits(((+amount - +redeemAmount) * 0.99).toFixed(6), await ausdt.decimals())
      );
    });
  });

  describe("Compound on staking (Integration test)", function () {
    it("Should compound backing contract when staking", async function () {
      const {  usdt, usdo, susdo, alice } = await loadFixture(
        deployFixture
      );
      const amount = '1000'
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(
          amount,
          await usdt.decimals()
        ),
        usdo_amount: ethers.parseEther(amount)
      };
      await usdo.connect(alice).mint(order);
      await usdo.connect(alice).supplyToBacking( 0);

      await usdo
        .connect(alice)
        .approve(await susdo.getAddress(), ethers.MaxUint256);

      await time.increase(3600 * 100);

      // RewardsReceived is emitted from the compounding effect
      expect(
        await susdo
          .connect(alice)
          .deposit(ethers.parseEther(amount), alice.address)
      ).to.emit(susdo, "RewardsReceived");

      await time.increase(3600 * 100);

      expect(
        await susdo
          .connect(alice)
          .withdraw(ethers.parseEther(amount), alice.address, alice.address)
      ).to.emit(susdo, "RewardsReceived");
    });
  });

  describe("Coumpound (Integration test)", function () {
    it("Should mint new USDO and split between recipients", async function () {
      const {
        usdt,
        usdo,
        susdo,
        ausdt,
        usdobacking,
        admin,
        alice,
      } = await loadFixture(deployFixture);
      const amount = '1000'
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(
          amount,
          await usdt.decimals()
        ),
        usdo_amount: ethers.parseEther(amount)
      };
      await usdo.connect(alice).mint(order);
      await usdo.connect(alice).supplyToBacking(0);

      const ausdtBefore = ethers.formatUnits(
        await ausdt.balanceOf(await usdobacking.getAddress()),
        await ausdt.decimals()
      );
      //advance time
      await time.increase(12 * 30 * 24 * 60 * 60); //12 months
      const ausdtAfter = ethers.formatUnits(
        await ausdt.balanceOf(await usdobacking.getAddress()),
        await ausdt.decimals()
      );

      const diffUsdt = new Big(ausdtAfter).minus(ausdtBefore);
      console.log(diffUsdt.toFixed(4))

      //test to fixed 2 decimals
      await usdobacking.connect(admin).compound();
      const teamRewardAllocation = ethers.formatEther(
        await usdo.balanceOf(admin.address)
      );
      expect((+teamRewardAllocation).toFixed(2)).to.be.equal(
        diffUsdt.mul(20).div(100).toFixed(2)
      );

      const expectedStakingAssets = diffUsdt.mul(80).div(100).plus(1).toFixed(2);
      const realStakingAssets = (+ethers.formatEther(
        await susdo.totalAssets()
      )).toFixed(2);
      expect(realStakingAssets).to.be.equal(expectedStakingAssets);
    });

    it("Should mint new USDO and split between recipients in emergency mode", async function () {
      const {
        usdt,
        usdo,
        susdo,
        ausdt,
        usdobacking,
        admin,
        alice
      } = await loadFixture(deployFixture);
      const amount = '1000'
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(
          amount,
          await usdt.decimals()
        ),
        usdo_amount: ethers.parseEther(amount)
      };
      await usdo.connect(alice).mint(order);
      await usdo.connect(alice).supplyToBacking( 0);

      const ausdtBefore = ethers.formatUnits(
        await ausdt.balanceOf(await usdobacking.getAddress()),
        await ausdt.decimals()
      );
      //advance time
      await time.increase(12 * 30 * 24 * 60 * 60); //12 months
      const ausdtAfter = ethers.formatUnits(
        await ausdt.balanceOf(await usdobacking.getAddress()),
        await ausdt.decimals()
      );

      const diffUsdt = new Big(ausdtAfter).minus(ausdtBefore);

      //test to fixed 2 decimals
      await usdobacking.connect(admin).compound();
      const teamRewardAllocation = ethers.formatEther(
        await usdo.balanceOf(admin.address)
      );
      expect((+teamRewardAllocation).toFixed(2)).to.be.equal(
        diffUsdt.mul(20).div(100).toFixed(2)
      );

      const expectedStakingAssets = diffUsdt.mul(80).div(100).plus(1).toFixed(2);
      const realStakingAssets = (+ethers.formatEther(
        await susdo.totalAssets()
      )).toFixed(2);
      expect(realStakingAssets).to.be.equal(expectedStakingAssets);

      const beforeEmergencyTeamAllocation = await usdo.balanceOf(admin.address);
      expect(await ausdt.balanceOf(await usdo.getAddress())).to.be.equal(0);

      await usdo.connect(admin).supplyToBacking( 0);
      await usdo.connect(admin).setEmergencyStatus(true);
      await time.increase(2 * 24 * 60 * 60); //2 days
      await usdobacking.connect(admin).compound();

      expect(await usdo.balanceOf(admin.address)).to.be.greaterThanOrEqual(
        beforeEmergencyTeamAllocation
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);
      expect(await ausdt.balanceOf(await usdo.getAddress())).to.be.greaterThan(
        0
      );
    });
  });

  describe("Admin emergency ops", function () {
    it("adminWithdraw - should unstake from AAVE and return user funds to protocol", async function () {
      const {
        usdt,
        usdo,
        ausdt,
        usdobacking,
        admin,
        alice,
        dispatcher,
        initialCollateralAmount
      } = await loadFixture(deployFixture);
      const amount = '1000'
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(
          amount,
          await usdt.decimals()
        ),
        usdo_amount: ethers.parseEther(amount)
      };
      await usdo.connect(alice).mint(order);
      expect(await usdo.connect(alice).supplyToBacking( 0)).to.emit(
        usdo,
        "SuppliedToBacking"
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits((+amount + +initialCollateralAmount).toFixed(6), await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits((+amount + +initialCollateralAmount).toFixed(1), await usdt.decimals())
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);

      await time.increase(12 * 30 * 24 * 60 * 60); //12 months

      let ausdtBal = await ausdt.balanceOf(await usdobacking.getAddress());
      await usdobacking.connect(admin).adminWithdraw();

      const atLeastUsdtAdmin =
        0.98 * (+ethers.formatUnits(ausdtBal, await usdt.decimals()) - (+amount + +initialCollateralAmount));
      expect(
        await usdt.balanceOf(await dispatcher.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(atLeastUsdtAdmin.toFixed(4), await usdt.decimals())
      );

      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(
        ethers.parseUnits((+amount + +initialCollateralAmount).toFixed(1), await usdt.decimals())
      );
    });

    it("adminWithdraw - should unstake from AAVE and return user funds to protocol in emergency mode", async function () {
      const {
        usdt,
        usdo,
        ausdt,
        usdobacking,
        admin,
        alice,
        dispatcher,
        initialCollateralAmount
      } = await loadFixture(deployFixture);
      const amount = '1000'
      const order = {
        benefactor: alice.address,
        beneficiary: alice.address,
        collateral: await usdt.getAddress(),
        collateral_amount: ethers.parseUnits(
          amount,
          await usdt.decimals()
        ),
        usdo_amount: ethers.parseEther(amount)
      };
      await usdo.connect(alice).mint(order);
      expect(await usdo.connect(alice).supplyToBacking( 0)).to.emit(
        usdo,
        "SuppliedToBacking"
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(((+amount + +initialCollateralAmount) * 0.99).toFixed(1), await ausdt.decimals())
      );
      expect(
        await ausdt.balanceOf(await usdobacking.getAddress())
      ).to.be.lessThanOrEqual(
        ethers.parseUnits(((+amount + +initialCollateralAmount) * 1.01).toFixed(1), await ausdt.decimals())
      );
      expect(await usdobacking.totalSuppliedUSDT()).to.be.equal(
        ethers.parseUnits((+amount + +initialCollateralAmount).toFixed(1), await usdt.decimals())
      );
      expect(await usdt.balanceOf(await usdo.getAddress())).to.be.equal(0);

      await time.increase(12 * 30 * 24 * 60 * 60); //12 months
      await usdo.connect(admin).setEmergencyStatus(true);

      let ausdtBal = await ausdt.balanceOf(await usdobacking.getAddress());
      await usdobacking.connect(admin).adminWithdraw();

      const atLeastUsdtAdmin =
        0.98 * (+ethers.formatUnits(ausdtBal, await usdt.decimals()) - +amount - +initialCollateralAmount);

      expect(
        await ausdt.balanceOf(await dispatcher.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(atLeastUsdtAdmin.toFixed(4), await usdt.decimals())
      );

      expect(
        await ausdt.balanceOf(await usdo.getAddress())
      ).to.be.greaterThanOrEqual(
        ethers.parseUnits(((+amount + +initialCollateralAmount) * 0.99).toFixed(1), await ausdt.decimals())
      );
    });
  });
});
