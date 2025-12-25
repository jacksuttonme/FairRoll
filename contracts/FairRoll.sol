// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ebool, euint8, euint64, externalEuint8, FHE} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title FairRoll - Encrypted dice game using Zama FHE
/// @notice Players buy points with ETH, guess dice rolls, and win encrypted rewards.
contract FairRoll is ZamaEthereumConfig {
    uint64 public constant REWARD_POINTS = 1000;
    uint256 public constant POINTS_PER_ETH = 100_000;

    mapping(address => euint64) private _balances;
    mapping(address => euint8) private _lastDice;
    mapping(address => euint8) private _lastGuess;
    mapping(address => euint64) private _lastReward;

    event PointsPurchased(address indexed player, uint256 ethAmount, uint64 pointsMinted);
    event RoundCompleted(address indexed player);

    /// @notice Converts ETH into encrypted points at a fixed rate.
    function buyPoints() external payable {
        require(msg.value > 0, "ETH required");

        uint256 points = (msg.value * POINTS_PER_ETH) / 1 ether;
        require(points > 0, "Value too small");

        euint64 minted = FHE.asEuint64(uint64(points));
        euint64 updated = FHE.add(_balances[msg.sender], minted);

        _balances[msg.sender] = updated;
        FHE.allowThis(updated);
        FHE.allow(updated, msg.sender);

        emit PointsPurchased(msg.sender, msg.value, uint64(points));
    }

    /// @notice Plays one round of the game with an encrypted guess (1 = big, 2 = small).
    /// @param encryptedGuess The encrypted guess submitted by the player.
    /// @param inputProof The Zama input proof for the encrypted guess.
    function playRound(externalEuint8 encryptedGuess, bytes calldata inputProof) external {
        euint8 guess = FHE.fromExternal(encryptedGuess, inputProof);

        euint8 diceZeroBased = FHE.rem(FHE.randEuint8(), 6);
        euint8 diceRoll = FHE.add(diceZeroBased, FHE.asEuint8(1));

        ebool guessBig = FHE.eq(guess, FHE.asEuint8(1));
        ebool guessSmall = FHE.eq(guess, FHE.asEuint8(2));
        ebool diceBig = FHE.gt(diceRoll, FHE.asEuint8(3));

        ebool winner = FHE.or(FHE.and(guessBig, diceBig), FHE.and(guessSmall, FHE.not(diceBig)));

        euint64 rewardAmount = FHE.asEuint64(REWARD_POINTS);
        euint64 rewardApplied = FHE.select(winner, rewardAmount, FHE.asEuint64(0));
        euint64 newBalance = FHE.add(_balances[msg.sender], rewardApplied);

        _balances[msg.sender] = newBalance;
        _lastDice[msg.sender] = diceRoll;
        _lastGuess[msg.sender] = guess;
        _lastReward[msg.sender] = rewardApplied;

        FHE.allowThis(newBalance);
        FHE.allow(newBalance, msg.sender);

        FHE.allowThis(diceRoll);
        FHE.allow(diceRoll, msg.sender);

        FHE.allowThis(guess);
        FHE.allow(guess, msg.sender);

        FHE.allowThis(rewardApplied);
        FHE.allow(rewardApplied, msg.sender);

        emit RoundCompleted(msg.sender);
    }

    /// @notice Returns the encrypted balance for a player.
    function getEncryptedBalance(address player) external view returns (euint64) {
        return _balances[player];
    }

    /// @notice Returns the encrypted dice, guess, and reward from the player's last round.
    function getLastRound(address player) external view returns (euint8 diceRoll, euint8 guess, euint64 reward) {
        return (_lastDice[player], _lastGuess[player], _lastReward[player]);
    }

    /// @notice Points rewarded for each successful guess.
    function rewardPoints() external pure returns (uint64) {
        return REWARD_POINTS;
    }

    /// @notice Points minted per ETH deposited.
    function pointsPerEth() external pure returns (uint256) {
        return POINTS_PER_ETH;
    }
}
