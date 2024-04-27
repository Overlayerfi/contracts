import { time, loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('StakedUSDxFront', function () {
  async function deployFixture() {
    const [admin, alice, bob] = await ethers.getSigners();

    const Usdc = await ethers.getContractFactory('SixDecimalsUsd');
    const usdc = await Usdc.deploy(1000, '', 'USDC');

    const Usdt = await ethers.getContractFactory('FixedSupplyERC20');
    const usdt = await Usdt.deploy(1000, 'USDT', 'USDT');

    const USDx = await ethers.getContractFactory('USDxM');
    const usdx = await USDx.deploy(
      await admin.getAddress(),
      {
        addr: await usdc.getAddress(),
        decimals: await usdc.decimals()
      },
      {
        addr: await usdt.getAddress(),
        decimals: await usdt.decimals()
      },
      await admin.getAddress(),
      ethers.parseEther('100000000'),
      ethers.parseEther('100000000')
    );

    //send some usdc and usdt to users
    await usdc
      .connect(admin)
      .transfer(alice.address, ethers.parseUnits('50', await usdc.decimals()));
    await usdc
      .connect(admin)
      .transfer(bob.address, ethers.parseUnits('50', await usdc.decimals()));
    await usdt
      .connect(admin)
      .transfer(alice.address, ethers.parseUnits('50', await usdt.decimals()));
    await usdt
      .connect(admin)
      .transfer(bob.address, ethers.parseUnits('50', await usdt.decimals()));

    await usdc
      .connect(alice)
      .approve(await usdx.getAddress(), ethers.MaxUint256);
    await usdc.connect(bob).approve(await usdx.getAddress(), ethers.MaxUint256);
    await usdc
      .connect(admin)
      .approve(await usdx.getAddress(), ethers.MaxUint256);
    await usdt
      .connect(alice)
      .approve(await usdx.getAddress(), ethers.MaxUint256);
    await usdt.connect(bob).approve(await usdx.getAddress(), ethers.MaxUint256);
    await usdt
      .connect(admin)
      .approve(await usdx.getAddress(), ethers.MaxUint256);

    // users mint usdx
    let mintOrder = {
      benefactor: alice.address,
      beneficiary: alice.address,
      collateral_usdt: await usdt.getAddress(),
      collateral_usdc: await usdc.getAddress(),
      collateral_usdt_amount: ethers.parseUnits('50', await usdt.decimals()),
      collateral_usdc_amount: ethers.parseUnits('50', await usdc.decimals()),
      usdx_amount: ethers.parseEther((50 * 2).toString())
    };
    await usdx.connect(alice).mint(mintOrder);
    mintOrder.benefactor = bob.address;
    mintOrder.beneficiary = bob.address;
    await usdx.connect(bob).mint(mintOrder);
    mintOrder.benefactor = admin.address;
    mintOrder.beneficiary = admin.address;
    mintOrder.collateral_usdc_amount = ethers.parseUnits(
      '100',
      await usdc.decimals()
    );
    mintOrder.collateral_usdt_amount = ethers.parseUnits(
      '100',
      await usdt.decimals()
    );
    mintOrder.usdx_amount = ethers.parseEther((100 * 2).toString());
    await usdx.connect(admin).mint(mintOrder);

    const StakedUSDx = await ethers.getContractFactory('StakedUSDxFront');
    const stakedusdx = await StakedUSDx.deploy(
      await usdx.getAddress(),
      admin.address,
      admin.address,
      0
    );

    await stakedusdx.connect(admin).setCooldownDuration(172800); // 2 days

    await usdx
      .connect(alice)
      .approve(await stakedusdx.getAddress(), ethers.MaxUint256);
    await usdx
      .connect(bob)
      .approve(await stakedusdx.getAddress(), ethers.MaxUint256);
    await usdx
      .connect(admin)
      .approve(await stakedusdx.getAddress(), ethers.MaxUint256);

    return { stakedusdx, usdc, usdt, usdx, admin, alice, bob };
  }

  describe('Deployment', function () {
    it('Should set the admin role', async function () {
      const { stakedusdx, admin } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      expect(await stakedusdx.owner()).to.equal(adminAddress);
    });

    it('Should set the rewarder role', async function () {
      const { stakedusdx, admin } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      expect(
        await stakedusdx.hasRole(
          ethers.keccak256(ethers.toUtf8Bytes('REWARDER_ROLE')),
          adminAddress
        )
      ).to.equal(true);
    });

    it('Should not have vesting time', async function () {
      const { stakedusdx } = await loadFixture(deployFixture);
      expect(await stakedusdx.vestingAmount()).to.equal(0);
    });
  });

  describe('Cooldown check', function () {
    it('Should disable ERC4626 withdraw', async function () {
      const { stakedusdx, alice } = await loadFixture(deployFixture);
      await expect(
        stakedusdx.connect(alice).withdraw(0, alice.address, alice.address)
      ).to.be.eventually.rejectedWith('OperationNotAllowed');
    });

    it('Should disable ERC4626 redeem', async function () {
      const { stakedusdx, alice } = await loadFixture(deployFixture);
      await expect(
        stakedusdx.connect(alice).redeem(0, alice.address, alice.address)
      ).to.be.eventually.rejectedWith('OperationNotAllowed');
    });
  });

  describe('Stake', function () {
    it('Should deposit', async function () {
      const { stakedusdx, admin, alice, bob } = await loadFixture(
        deployFixture
      );
      expect(await stakedusdx.totalAssets()).to.equal(0);
      expect(await stakedusdx.totalSupply()).to.equal(0);
      await expect(
        await stakedusdx
          .connect(alice)
          .deposit(ethers.parseEther('10'), alice.address)
      ).to.emit(stakedusdx, 'Deposit');
      await expect(
        await stakedusdx
          .connect(bob)
          .deposit(ethers.parseEther('5'), bob.address)
      ).to.emit(stakedusdx, 'Deposit');
      expect(await stakedusdx.totalAssets()).to.equal(ethers.parseEther('15'));
      expect(await stakedusdx.totalSupply()).to.equal(ethers.parseEther('15'));
      expect(await stakedusdx.balanceOf(alice.address)).to.equal(
        ethers.parseEther('10')
      );
      expect(await stakedusdx.balanceOf(bob.address)).to.equal(
        ethers.parseEther('5')
      );
      expect(await stakedusdx.balanceOf(admin.address)).to.equal(
        ethers.parseEther('0')
      );

      expect(await stakedusdx.previewRedeem(ethers.parseEther('1'))).to.equal(
        ethers.parseEther('1')
      );
    });

    it('Should not deposit if full blacklisted', async function () {
      const { stakedusdx, admin, alice } = await loadFixture(deployFixture);
      await stakedusdx.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes('BLACKLIST_MANAGER_ROLE')),
        admin.address
      );
      await stakedusdx.connect(admin).addToBlacklist(alice.address, true);
      await expect(
        stakedusdx
          .connect(alice)
          .deposit(ethers.parseEther('10'), alice.address)
      ).to.be.eventually.rejectedWith('OperationNotAllowed');
    });

    it('Should not deposit if soft blacklisted', async function () {
      const { stakedusdx, admin, alice } = await loadFixture(deployFixture);
      await stakedusdx.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes('BLACKLIST_MANAGER_ROLE')),
        admin.address
      );
      await stakedusdx.connect(admin).addToBlacklist(alice.address, false);
      await expect(
        stakedusdx
          .connect(alice)
          .deposit(ethers.parseEther('10'), alice.address)
      ).to.be.eventually.rejectedWith('OperationNotAllowed');
    });
  });

  describe('Preview Redeem', function () {
    it('Should update preview redeem on asset injection', async function () {
      const { stakedusdx, admin, usdx, alice, bob } = await loadFixture(
        deployFixture
      );
      await expect(
        await stakedusdx
          .connect(alice)
          .deposit(ethers.parseEther('10'), alice.address)
      ).to.emit(stakedusdx, 'Deposit');
      await expect(
        await stakedusdx
          .connect(bob)
          .deposit(ethers.parseEther('5'), bob.address)
      ).to.emit(stakedusdx, 'Deposit');
      await usdx
        .connect(admin)
        .transfer(await stakedusdx.getAddress(), ethers.parseEther('15'));
      expect(await stakedusdx.totalAssets()).to.equal(ethers.parseEther('30'));
      expect(await stakedusdx.totalSupply()).to.equal(ethers.parseEther('15'));

      expect(
        await stakedusdx.previewRedeem(ethers.parseEther('1'))
      ).to.be.greaterThan(ethers.parseEther('1.9'));
      expect(
        await stakedusdx.previewRedeem(ethers.parseEther('1'))
      ).to.be.lessThan(ethers.parseEther('2.0'));

      //check unvested amount
      expect(await stakedusdx.getUnvestedAmount()).to.equal(0);

      await usdx
        .connect(admin)
        .transfer(await stakedusdx.getAddress(), ethers.parseEther('30'));

      expect(
        await stakedusdx.previewRedeem(ethers.parseEther('1'))
      ).to.be.greaterThan(ethers.parseEther('3.9'));
      expect(
        await stakedusdx.previewRedeem(ethers.parseEther('1'))
      ).to.be.lessThan(ethers.parseEther('4.0'));
    });
  });

  describe('Cooldown Shares & Unstake', function () {
    it('Should start cooldown', async function () {
      const { stakedusdx, alice } = await loadFixture(deployFixture);
      await expect(
        await stakedusdx
          .connect(alice)
          .deposit(ethers.parseEther('10'), alice.address)
      ).to.emit(stakedusdx, 'Deposit');
      await stakedusdx.connect(alice).cooldownShares(ethers.parseEther('5'));
      expect(await stakedusdx.balanceOf(alice.address)).to.equal(
        ethers.parseEther('5')
      );
      expect(
        (await stakedusdx.cooldowns(alice.address)).underlyingAmount
      ).to.equal(ethers.parseEther('5'));
      const now = await time.latest();
      expect((await stakedusdx.cooldowns(alice.address)).cooldownEnd).to.equal(
        now + 172800
      );
    });

    it('Should not unstake before cooldown', async function () {
      const { stakedusdx, alice } = await loadFixture(deployFixture);
      await expect(
        await stakedusdx
          .connect(alice)
          .deposit(ethers.parseEther('10'), alice.address)
      ).to.emit(stakedusdx, 'Deposit');
      await stakedusdx.connect(alice).cooldownShares(ethers.parseEther('5'));
      const now = await time.latest();
      expect((await stakedusdx.cooldowns(alice.address)).cooldownEnd).to.equal(
        now + 172800
      );
      await expect(
        stakedusdx.connect(alice).unstake(alice.address)
      ).to.be.eventually.rejectedWith('InvalidCooldown');
      await time.increase(172759);
      await expect(
        stakedusdx.connect(alice).unstake(alice.address)
      ).to.be.eventually.rejectedWith('InvalidCooldown');
    });

    it('Should unstake after cooldown', async function () {
      const { stakedusdx, admin, usdx, alice, bob } = await loadFixture(
        deployFixture
      );
      await stakedusdx
        .connect(alice)
        .deposit(ethers.parseEther('10'), alice.address);
      await stakedusdx
        .connect(bob)
        .deposit(ethers.parseEther('5'), bob.address);
      await usdx
        .connect(admin)
        .transfer(await stakedusdx.getAddress(), ethers.parseEther('15'));
      await stakedusdx.connect(alice).cooldownShares(ethers.parseEther('10'));
      await stakedusdx.connect(bob).cooldownShares(ethers.parseEther('5'));
      await time.increase(182759);
      const beforeAliceBal = ethers.formatEther(await usdx.balanceOf(alice));
      const beforeBobBal = ethers.formatEther(await usdx.balanceOf(bob));
      await stakedusdx.connect(alice).unstake(alice.address);
      await stakedusdx.connect(bob).unstake(bob.address);
      const afterAliceBal = ethers.formatEther(await usdx.balanceOf(alice));
      const afterBobBal = ethers.formatEther(await usdx.balanceOf(bob));
      expect(
        Number.parseFloat(afterAliceBal) - Number.parseFloat(beforeAliceBal)
      ).to.be.greaterThan(19.9);
      expect(
        Number.parseFloat(afterAliceBal) - Number.parseFloat(beforeAliceBal)
      ).to.be.lessThan(20.1);
      expect(
        Number.parseFloat(afterBobBal) - Number.parseFloat(beforeBobBal)
      ).to.be.greaterThan(9.9);
      expect(
        Number.parseFloat(afterBobBal) - Number.parseFloat(beforeBobBal)
      ).to.be.lessThan(10.1);
    });
  });
});
