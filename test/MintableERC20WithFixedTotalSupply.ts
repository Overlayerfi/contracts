import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe ('MintableERC20WithFixedTotalSupply', function () {

  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    const [owner, luke, alice, bob] = await ethers.getSigners();
		
    const Liquidity = await ethers.getContractFactory("Liquidity");
    const liquidity = await Liquidity.deploy(owner.address, 0);

    const Token = await ethers.getContractFactory("MintableERC20WithFixedTotalSupply");
    const token = await Token.deploy(0, ethers.parseEther("1000000"), "Token", "TKN");
    await token.waitForDeployment();

		await token.setMinter(liquidity.getAddress());

    return { token, owner, luke, alice, bob, liquidity };
  }

  describe('Minter', async function () {
    it ('Should  mint', async function () {
      const amount = ethers.parseEther('10');
      const { token, owner } = await loadFixture(deployFixture);
			await expect(await token.connect(owner).mint(amount)).to.emit(token, 'Transfer');
			expect((await token.totalSupply()).toString()).to.be.equal(amount);
    });

    it ('Should not mint over max supply', async function () {
      const amount = ethers.parseEther('1000001');
      const { token, owner } = await loadFixture(deployFixture);
			await expect(token.connect(owner).mint(amount)).to.be.eventually.rejectedWith("ERC20: MAX_SUPPLY");
    });

    it ('Should not mint', async function () {
      const { token, owner, luke } = await loadFixture(deployFixture);
			await expect(token.connect(luke).mint('10')).to.be.eventually.rejected;

      await token.connect(owner).setMinter(luke.address);
			await expect(await token.connect(luke).mint('10')).to.emit(token, 'Transfer');
      await token.connect(owner).removeMinter(luke.address);
			await expect(token.connect(luke).mint('10')).to.be.eventually.rejected;
    });
  });

  describe('Burner', async function () {
    it ('Should burn ', async function () {
      const amount = ethers.parseEther('10');
      const { token, owner } = await loadFixture(deployFixture);
			await expect(await token.connect(owner).mint(amount)).to.emit(token, 'Transfer');
			expect((await token.totalSupply()).toString()).to.be.equal(amount);
			await expect(await token.connect(owner).burn(amount)).to.emit(token, 'Transfer');
			expect((await token.totalSupply()).toString()).to.be.equal(ethers.parseEther('0'));
    });

    it ('Should not burn if without balance', async function () {
      const { token, luke } = await loadFixture(deployFixture);
			await expect(token.connect(luke).burn('10')).to.be.eventually.rejected;
    });
  });
});
