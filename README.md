# FairRoll

FairRoll is a privacy-preserving dice game built on Zama FHEVM. Players convert ETH into encrypted points, submit an
encrypted "big" or "small" guess, and earn encrypted rewards when their guess matches the on-chain dice roll.

## Overview

FairRoll combines on-chain randomness with fully homomorphic encryption (FHE) so that guesses, balances, and rewards
stay private. The contract only stores encrypted handles; users decrypt their own data client-side through the Zama
relayer flow.

## Game Rules

- Exchange rate: 1 ETH = 100,000 points.
- Guess format: big = 1, small = 2.
- Dice roll: random integer from 1 to 6, generated on-chain via Zama FHE.
- Win condition: big wins on 4-6, small wins on 1-3.
- Reward: 1,000 points for a correct guess, 0 points otherwise.

## Problems Solved

- **Private player decisions**: Guess data is encrypted before it hits the chain, preventing copy-trading or
  front-running based on guess visibility.
- **Fair randomness**: The dice roll is produced on-chain using Zama FHE randomness, avoiding off-chain oracles.
- **Confidential balances**: Points are stored as encrypted values, so player balances and rewards are not publicly
  visible.
- **Self-serve decryption**: Players can decrypt their own data without revealing it to other users.

## Advantages

- **Confidential gameplay**: No plaintext guesses or payouts are revealed on-chain.
- **Deterministic rules**: All game logic is enforced by the contract, with immutable rates and rewards.
- **Client-controlled privacy**: Only the player can decrypt their balance and latest round data.
- **Simple UX**: Two-step flow (buy points, play a round) with clear on-chain status updates.
- **Composable tooling**: Hardhat tasks let developers verify gameplay and decryption from the CLI.

## How It Works

1. **Buy points**: The player calls `buyPoints` with ETH. The contract mints encrypted points at a fixed rate.
2. **Encrypt guess**: The frontend encrypts the guess (1 or 2) using the Zama relayer SDK.
3. **Play round**: The player submits the encrypted guess to `playRound`.
4. **Generate dice**: The contract computes a random encrypted dice value (1-6).
5. **Evaluate winner**: The contract compares the encrypted guess with the dice outcome and updates the encrypted
   balance.
6. **Decrypt results**: The player signs an EIP-712 request and decrypts their encrypted handles client-side.

## Smart Contract Details

Contract: `contracts/FairRoll.sol`

- `buyPoints()` converts ETH to encrypted points.
- `playRound(externalEuint8 guess, bytes inputProof)` runs a round with an encrypted guess.
- `getEncryptedBalance(address player)` returns the encrypted point handle.
- `getLastRound(address player)` returns encrypted handles for the last dice, guess, and reward.
- `REWARD_POINTS` is 1,000.
- `POINTS_PER_ETH` is 100,000.

## Frontend Details

Frontend: `frontend/`

- **Write calls** use ethers (for signing and transaction submission).
- **Read calls** use viem/wagmi (for lightweight contract reads).
- **Encryption/decryption** uses the Zama relayer SDK and EIP-712 signatures.
- **No local chain support**: the app targets Sepolia only.
- **ABI handling**: copy the ABI from `deployments/sepolia/FairRoll.json` into
  `frontend/src/config/contracts.ts` (no JSON imports inside the frontend).

## Tech Stack

- **Smart contracts**: Solidity, Hardhat, hardhat-deploy
- **FHE**: Zama FHEVM Solidity library and relayer flow
- **Frontend**: React + Vite, wagmi, viem, RainbowKit, ethers
- **Testing**: Hardhat + Chai + FHEVM plugin

## Repository Structure

```
.
├── contracts/            # Solidity contracts
├── deploy/               # Deployment scripts
├── deployments/          # Deployed artifacts (per network)
├── tasks/                # Hardhat tasks
├── test/                 # Hardhat tests
├── frontend/             # React app
├── docs/                 # Zama docs references
└── hardhat.config.ts     # Hardhat config
```

## Prerequisites

- Node.js 20+
- npm
- Sepolia ETH for transactions
- Zama FHEVM dependencies (installed via npm)

## Configuration

Create a `.env` file in the repository root with the following keys:

```
INFURA_API_KEY=...
PRIVATE_KEY=...
ETHERSCAN_API_KEY=...   # Optional, for contract verification
REPORT_GAS=1            # Optional, enables gas reporter
```

Notes:
- `PRIVATE_KEY` is required for Sepolia deployment. Do not use a mnemonic.
- The frontend does not read environment variables.

## Local Development (Contracts)

Install dependencies:

```bash
npm install
```

Compile and run unit tests (mock FHE):

```bash
npm run compile
npm run test
```

Run the Hardhat node and deploy locally (contract-only):

```bash
npx hardhat node
npx hardhat deploy --network hardhat
```

## Sepolia Deployment (Required for the Frontend)

Run tasks and tests first, then deploy:

```bash
npx hardhat test
npx hardhat deploy --network sepolia
```

Optionally verify the contract:

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

After deployment:

1. Copy the ABI from `deployments/sepolia/FairRoll.json`.
2. Update `frontend/src/config/contracts.ts` with the ABI and deployed address.

## Hardhat Tasks

Print the deployed address:

```bash
npx hardhat task:address --network sepolia
```

Buy points from the CLI:

```bash
npx hardhat task:buy --eth 0.1 --network sepolia
```

Play a round:

```bash
npx hardhat task:play --guess 1 --network sepolia
```

Decrypt a balance:

```bash
npx hardhat task:balance --account <ADDRESS> --network sepolia
```

## Frontend Setup

From `frontend/`:

```bash
npm install
npm run dev
```

Open the app, connect a wallet on Sepolia, and:

1. Buy points with ETH.
2. Submit an encrypted guess.
3. Decrypt to reveal the dice, guess, reward, and updated balance.

## Limitations

- Points are not redeemable for ETH in the current contract.
- Only the last round is stored; there is no on-chain round history.
- Privacy relies on the Zama relayer flow and user key management.
- This repository has not been formally audited.

## Roadmap

- Add encrypted leaderboards and seasonal scoring.
- Support multiple simultaneous rounds per player.
- Add configurable reward schedules or house edge parameters.
- Add event indexing helpers for analytics without revealing private data.
- Expand frontend UX with round history exported from client-side decryption.

## License

BSD-3-Clause-Clear. See `LICENSE`.
