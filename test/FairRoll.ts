import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { FairRoll, FairRoll__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("FairRoll")) as FairRoll__factory;
  const fairRollContract = (await factory.deploy()) as FairRoll;
  const fairRollContractAddress = await fairRollContract.getAddress();

  return { fairRollContract, fairRollContractAddress };
}

describe("FairRoll", function () {
  let signers: Signers;
  let fairRollContract: FairRoll;
  let fairRollContractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ fairRollContract, fairRollContractAddress } = await deployFixture());
  });

  it("starts with an uninitialized encrypted balance", async function () {
    const encryptedBalance = await fairRollContract.getEncryptedBalance(signers.alice.address);
    expect(encryptedBalance).to.eq(ethers.ZeroHash);
  });

  it("mints points at the expected exchange rate", async function () {
    const value = ethers.parseEther("1");
    await fairRollContract.connect(signers.alice).buyPoints({ value });

    const encryptedBalance = await fairRollContract.getEncryptedBalance(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      fairRollContractAddress,
      signers.alice,
    );

    expect(clearBalance).to.eq(100_000);
  });

  it("records the last round with encrypted dice and rewards", async function () {
    const initialBalanceHandle = await fairRollContract.getEncryptedBalance(signers.alice.address);
    const initialBalance =
      initialBalanceHandle === ethers.ZeroHash
        ? 0
        : Number(
            await fhevm.userDecryptEuint(
              FhevmType.euint64,
              initialBalanceHandle,
              fairRollContractAddress,
              signers.alice,
            ),
          );

    const encryptedGuess = await fhevm
      .createEncryptedInput(fairRollContractAddress, signers.alice.address)
      .add8(1)
      .encrypt();

    const tx = await fairRollContract
      .connect(signers.alice)
      .playRound(encryptedGuess.handles[0], encryptedGuess.inputProof);
    await tx.wait();

    const round = await fairRollContract.getLastRound(signers.alice.address);
    const diceValue = Number(
      await fhevm.userDecryptEuint(FhevmType.euint8, round[0], fairRollContractAddress, signers.alice),
    );
    const guessValue = Number(
      await fhevm.userDecryptEuint(FhevmType.euint8, round[1], fairRollContractAddress, signers.alice),
    );
    const rewardValue = Number(
      await fhevm.userDecryptEuint(FhevmType.euint64, round[2], fairRollContractAddress, signers.alice),
    );

    expect(guessValue).to.eq(1);

    const expectedReward = diceValue > 3 ? 1000 : 0;
    expect(rewardValue).to.eq(expectedReward);

    const postBalanceHandle = await fairRollContract.getEncryptedBalance(signers.alice.address);
    const postBalance = Number(
      await fhevm.userDecryptEuint(FhevmType.euint64, postBalanceHandle, fairRollContractAddress, signers.alice),
    );

    expect(postBalance - initialBalance).to.eq(expectedReward);
  });
});
