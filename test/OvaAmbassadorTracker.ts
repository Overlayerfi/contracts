import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("OvaAmbassadorTracker", function () {
  async function deployFixture() {
    const [admin, a1, a2, a3] = await ethers.getSigners();

    const block = await admin.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(10)
    };

    const Contract = await ethers.getContractFactory("OvaAmbassadorTracker");
    const contract = await Contract.deploy(
      admin.address,
      defaultTransactionOptions
    );

    const OvaReferral = await ethers.getContractFactory("OvaReferral");
    const ovaReferral = await OvaReferral.deploy(
      admin.address,
      defaultTransactionOptions
    );

    await ovaReferral.setMinter(await contract.getAddress());

    return { contract, ovaReferral, admin, a1, a2, a3 };
  }

  describe("Ambassador flow", function () {
    it("Should add an ambassador", async function () {
      const { contract, admin, a1, a2, a3 } = await loadFixture(deployFixture);
      const ambassadors = [a1.address, a2.address, a3.address];
      await contract.addAmbassadorBatch(ambassadors);
      expect(await contract.ambassadors(a1.address)).to.be.equal(true);
      expect(await contract.ambassadors(a2.address)).to.be.equal(true);
      expect(await contract.ambassadors(a3.address)).to.be.equal(true);
      expect(await contract.ambassadors(admin.address)).to.be.equal(false);
    });

    it("Should remove an ambassador", async function () {
      const { contract, admin, a1, a2, a3 } = await loadFixture(deployFixture);
      const ambassadors = [a1.address, a2.address, a3.address];
      await contract.addAmbassadorBatch(ambassadors);
      expect(await contract.ambassadors(a1.address)).to.be.equal(true);
      expect(await contract.ambassadors(a2.address)).to.be.equal(true);
      expect(await contract.ambassadors(a3.address)).to.be.equal(true);
      expect(await contract.ambassadors(admin.address)).to.be.equal(false);

      await contract.removeAmbassador(a2.address);
      expect(await contract.ambassadors(a2.address)).to.be.equal(false);
    });

    it("Should add points", async function () {
      const { contract, admin, a1, a2, a3 } = await loadFixture(deployFixture);
      const ambassadors = [a1.address, a2.address];
      await contract.addAmbassadorBatch(ambassadors);

      let ambassadorsPoints = [
        { who: a1.address, points: ethers.parseEther("100") },
        { who: a2.address, points: ethers.parseEther("200") }
      ];
      await contract.setAmbassadorPoints(ambassadorsPoints);

      expect(await contract.ambassadorsTracker(a1.address)).to.be.equal(
        ethers.parseEther("100")
      );
      expect(await contract.ambassadorsTracker(a2.address)).to.be.equal(
        ethers.parseEther("200")
      );

      let newAmbassadorsPoints = [
        { who: a1.address, points: ethers.parseEther("100") },
        { who: a2.address, points: ethers.parseEther("200") },
        { who: a3.address, points: ethers.parseEther("200") }
      ];

      await expect(contract.setAmbassadorPoints(newAmbassadorsPoints)).to.be
        .eventually.rejected;
    });

    it("Should collect points", async function () {
      const { contract, ovaReferral, admin, a1, a2, a3 } = await loadFixture(
        deployFixture
      );
      const ambassadors = [a1.address, a2.address];
      await contract.addAmbassadorBatch(ambassadors);

      let ambassadorsPoints = [
        { who: a1.address, points: ethers.parseEther("100") },
        { who: a2.address, points: ethers.parseEther("200") }
      ];
      await contract.setAmbassadorPoints(ambassadorsPoints);

      expect(await contract.ambassadorsTracker(a1.address)).to.be.equal(
        ethers.parseEther("100")
      );
      expect(await contract.ambassadorsTracker(a2.address)).to.be.equal(
        ethers.parseEther("200")
      );

      await contract.setReward(await ovaReferral.getAddress());

      // Collection not set
      await expect(contract.connect(a1).collect()).to.be.eventually.rejected;
      await expect(contract.connect(a2).collect()).to.be.eventually.rejected;

      const timeNow = await time.latest();
      await contract.setCollectionTime(timeNow + 60 * 60);
      await time.increase(60 * 30);

      // Collection not active
      await expect(contract.connect(a1).collect()).to.be.eventually.rejected;
      await expect(contract.connect(a2).collect()).to.be.eventually.rejected;

      await time.increase(60 * 31);
      await contract.connect(a1).collect();
      await contract.connect(a2).collect();
      expect(await ovaReferral.balanceOf(a1.address)).to.be.equal(
        ethers.parseEther("100")
      );
      expect(await ovaReferral.balanceOf(a2.address)).to.be.equal(
        ethers.parseEther("200")
      );

      expect(await contract.ambassadorsTracker(a1.address)).to.be.equal(0);
      expect(await contract.ambassadorsTracker(a2.address)).to.be.equal(0);
    });
  });
});
