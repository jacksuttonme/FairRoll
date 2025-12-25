import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:address", "Prints the FairRoll address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const deployment = await hre.deployments.get("FairRoll");
  console.log("FairRoll address is " + deployment.address);
});

task("task:balance", "Decrypts the encrypted point balance for an account")
  .addOptionalParam("account", "Account to query (defaults to first signer)")
  .addOptionalParam("contract", "Contract address override")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.contract ? { address: taskArguments.contract } : await deployments.get("FairRoll");
    const fairRoll = await ethers.getContractAt("FairRoll", deployment.address);

    const signers = await ethers.getSigners();
    const targetAddress: string = taskArguments.account ?? signers[0].address;
    const signerForDecryption = signers.find((signer) => signer.address === targetAddress) ?? signers[0];

    const encryptedBalance = await fairRoll.getEncryptedBalance(targetAddress);
    if (encryptedBalance === ethers.ZeroHash) {
      console.log(`Encrypted balance for ${targetAddress}: ${encryptedBalance}`);
      console.log(`Clear balance   : 0`);
      return;
    }

    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      deployment.address,
      signerForDecryption,
    );

    console.log(`Encrypted balance for ${targetAddress}: ${encryptedBalance}`);
    console.log(`Clear balance   : ${clearBalance}`);
  });

task("task:buy", "Buys points with ETH at the fixed exchange rate")
  .addParam("eth", "ETH amount to convert (e.g. 0.1)")
  .addOptionalParam("contract", "Contract address override")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const value = ethers.parseEther(taskArguments.eth);
    const deployment = taskArguments.contract ? { address: taskArguments.contract } : await deployments.get("FairRoll");

    const [signer] = await ethers.getSigners();
    const fairRoll = await ethers.getContractAt("FairRoll", deployment.address);

    console.log(`Buying points with ${taskArguments.eth} ETH from ${signer.address}...`);
    const tx = await fairRoll.connect(signer).buyPoints({ value });
    await tx.wait();

    const encryptedBalance = await fairRoll.getEncryptedBalance(signer.address);
    console.log("New encrypted balance:", encryptedBalance);
  });

task("task:play", "Plays one round (1 = big, 2 = small)")
  .addParam("guess", "Your guess (1 for big, 2 for small)")
  .addOptionalParam("contract", "Contract address override")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    const guess = parseInt(taskArguments.guess);
    if (guess !== 1 && guess !== 2) {
      throw new Error("Guess must be 1 (big) or 2 (small)");
    }

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.contract ? { address: taskArguments.contract } : await deployments.get("FairRoll");
    const [signer] = await ethers.getSigners();
    const fairRoll = await ethers.getContractAt("FairRoll", deployment.address);

    const encryptedGuess = await fhevm
      .createEncryptedInput(deployment.address, signer.address)
      .add8(guess)
      .encrypt();

    console.log(`Rolling the dice with guess=${guess} as ${signer.address}...`);
    const tx = await fairRoll.connect(signer).playRound(encryptedGuess.handles[0], encryptedGuess.inputProof);
    await tx.wait();

    const round = await fairRoll.getLastRound(signer.address);
    console.log("Last dice handle :", round[0]);
    console.log("Last guess handle:", round[1]);
    console.log("Reward handle    :", round[2]);
  });
