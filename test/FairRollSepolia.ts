import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, deployments, fhevm } from "hardhat";
import { FairRoll } from "../types";
import { expect } from "chai";

describe("FairRollSepolia", function () {
  let fairRoll: FairRoll;
  let alice: HardhatEthersSigner;

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    const deployment = await deployments.get("FairRoll");
    fairRoll = await ethers.getContractAt("FairRoll", deployment.address);

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    alice = ethSigners[0];
  });

  it("exposes public constants", async function () {
    const rate = await fairRoll.pointsPerEth();
    const reward = await fairRoll.rewardPoints();

    expect(rate).to.eq(100_000);
    expect(reward).to.eq(1000);
    expect(alice.address).to.properAddress;
  });
});
