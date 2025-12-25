import { useEffect, useMemo, useState } from 'react';
import { Contract, ethers } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';
import { Header } from './Header';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import '../styles/FairRoll.css';

type LastRoundTuple = readonly [string, string, string] | undefined;

const ZERO_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';

export function FairRollApp() {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [ethAmount, setEthAmount] = useState('0.05');
  const [selectedGuess, setSelectedGuess] = useState<1 | 2>(1);
  const [decryptedBalance, setDecryptedBalance] = useState<number | null>(null);
  const [lastDice, setLastDice] = useState<number | null>(null);
  const [lastGuess, setLastGuess] = useState<number | null>(null);
  const [lastReward, setLastReward] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [isRolling, setIsRolling] = useState(false);

  const isContractReady = true

  const { data: rateData } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'pointsPerEth',
    query: { enabled: isContractReady },
  });

  const { data: rewardData } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'rewardPoints',
    query: { enabled: isContractReady },
  });

  const {
    data: encryptedBalance,
    refetch: refetchBalance,
    isFetching: balanceLoading,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getEncryptedBalance',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isContractReady },
  });

  const {
    data: lastRound,
    refetch: refetchLastRound,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getLastRound',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isContractReady },
  });

  const lastRoundData = lastRound as LastRoundTuple;

  const exchangeRate = useMemo(() => (rateData ? Number(rateData) : 100000), [rateData]);
  const rewardSize = useMemo(() => (rewardData ? Number(rewardData) : 1000), [rewardData]);

  const hasHandles =
    isContractReady &&
    ((!!encryptedBalance && encryptedBalance !== ZERO_HANDLE) ||
    (lastRoundData &&
      (lastRoundData[0] !== ZERO_HANDLE || lastRoundData[1] !== ZERO_HANDLE || lastRoundData[2] !== ZERO_HANDLE)));

  const formatNumber = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat().format(value);
  };

  const decryptLatest = async () => {
    if (!instance || !address || !signerPromise || !hasHandles) {
      return;
    }

    const handles: { handle: string; contractAddress: string }[] = [];
    if (encryptedBalance && encryptedBalance !== ZERO_HANDLE) {
      handles.push({ handle: encryptedBalance as string, contractAddress: CONTRACT_ADDRESS });
    }

    if (lastRoundData) {
      const [diceHandle, guessHandle, rewardHandle] = lastRoundData;
      if (diceHandle && diceHandle !== ZERO_HANDLE) {
        handles.push({ handle: diceHandle as string, contractAddress: CONTRACT_ADDRESS });
      }
      if (guessHandle && guessHandle !== ZERO_HANDLE) {
        handles.push({ handle: guessHandle as string, contractAddress: CONTRACT_ADDRESS });
      }
      if (rewardHandle && rewardHandle !== ZERO_HANDLE) {
        handles.push({ handle: rewardHandle as string, contractAddress: CONTRACT_ADDRESS });
      }
    }

    if (!handles.length) {
      setDecryptedBalance(null);
      setLastDice(null);
      setLastGuess(null);
      setLastReward(null);
      return;
    }

    setDecrypting(true);
    setErrorMessage(null);

    try {
      const keypair = instance.generateKeypair();
      const contractAddresses = [CONTRACT_ADDRESS];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '5';

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Wallet signer unavailable');
      }

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message
      );

      const result = await instance.userDecrypt(
        handles,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays
      );

      if (encryptedBalance && encryptedBalance !== ZERO_HANDLE) {
        const clearBalance = result[encryptedBalance as string];
        if (clearBalance !== undefined) {
          setDecryptedBalance(Number(clearBalance));
        }
      }

      if (lastRoundData) {
        const [diceHandle, guessHandle, rewardHandle] = lastRoundData;
        if (diceHandle && diceHandle !== ZERO_HANDLE) {
          setLastDice(Number(result[diceHandle as string] ?? 0));
        }
        if (guessHandle && guessHandle !== ZERO_HANDLE) {
          setLastGuess(Number(result[guessHandle as string] ?? 0));
        }
        if (rewardHandle && rewardHandle !== ZERO_HANDLE) {
          setLastReward(Number(result[rewardHandle as string] ?? 0));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decrypt values';
      setErrorMessage(message);
    } finally {
      setDecrypting(false);
    }
  };

  useEffect(() => {
    if (address && instance && hasHandles && !decrypting) {
      decryptLatest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, instance, encryptedBalance, lastRound]);

  const handleBuyPoints = async () => {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!address) {
      setErrorMessage('Connect your wallet to buy points.');
      return;
    }

    if (!isContractReady) {
      setErrorMessage('Deploy FairRoll to Sepolia and update CONTRACT_ADDRESS before purchasing points.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setErrorMessage('Wallet signer unavailable.');
      return;
    }

    let parsedValue: bigint;
    try {
      parsedValue = ethers.parseEther(ethAmount || '0');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid amount';
      setErrorMessage(message);
      return;
    }

    if (parsedValue <= 0) {
      setErrorMessage('Enter a positive ETH amount.');
      return;
    }

    setIsBuying(true);
    try {
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.buyPoints({ value: parsedValue });
      setStatusMessage('Waiting for confirmation...');
      await tx.wait();
      setStatusMessage('Points added to your encrypted balance.');
      setEthAmount('');
      await Promise.allSettled([refetchBalance(), refetchLastRound()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to buy points';
      setErrorMessage(message);
    } finally {
      setIsBuying(false);
    }
  };

  const handlePlayRound = async () => {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!instance) {
      setErrorMessage('Encryption service is still loading.');
      return;
    }

    if (!address) {
      setErrorMessage('Connect your wallet to roll.');
      return;
    }

    if (!isContractReady) {
      setErrorMessage('Deploy FairRoll to Sepolia and update CONTRACT_ADDRESS before playing.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setErrorMessage('Wallet signer unavailable.');
      return;
    }

    setIsRolling(true);
    try {
      const buffer = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      buffer.add8(selectedGuess);
      const encryptedGuess = await buffer.encrypt();

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.playRound(encryptedGuess.handles[0], encryptedGuess.inputProof);
      setStatusMessage('Dice rolling on-chain...');
      await tx.wait();
      setStatusMessage('Round finished. Decrypt to reveal the roll.');
      await Promise.allSettled([refetchBalance(), refetchLastRound()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to play round';
      setErrorMessage(message);
    } finally {
      setIsRolling(false);
    }
  };

  const lastOutcomeText = useMemo(() => {
    if (lastGuess === null || lastDice === null || lastReward === null) {
      return 'Play a round to reveal the outcome.';
    }

    const guessed = lastGuess === 1 ? 'Big (4-6)' : 'Small (1-3)';
    const diceText = `Rolled ${lastDice}`;
    const rewardText = lastReward > 0 ? `+${formatNumber(lastReward)} pts` : 'No reward this time';

    return `${diceText} · You chose ${guessed} · ${rewardText}`;
  }, [lastDice, lastGuess, lastReward]);

  return (
    <div className="page">
      <Header />
      <main className="content">
        <section className="hero">
          <div>
            <p className="eyebrow">On-chain randomness · Encrypted payouts</p>
            <h2>Roll the dice without revealing your move.</h2>
            <p className="lead">
              FairRoll lets you play a high/low dice game powered by Zama FHE. Buy points with ETH, submit
              encrypted guesses, and decrypt your rewards client-side.
            </p>
            <div className="pill-row">
              <span className="pill">1 ETH = {formatNumber(exchangeRate)} pts</span>
              <span className="pill">Correct guess reward: {formatNumber(rewardSize)} pts</span>
              <span className="pill">Chain: Sepolia</span>
            </div>
          </div>
            <div className="hero-card">
              <div className="stat">
                <p className="stat-label">Encrypted balance</p>
                <p className="stat-value">
                {balanceLoading ? 'Loading...' : formatNumber(decryptedBalance)}
                </p>
                <p className="stat-help">Decrypt to reveal your latest points.</p>
              </div>
              <button
                className="ghost-button"
                onClick={decryptLatest}
              disabled={!address || !hasHandles || decrypting || !isContractReady || zamaLoading}
              >
                {decrypting ? 'Decrypting...' : 'Decrypt my data'}
              </button>
              {zamaLoading && <p className="stat-help">Initializing the Zama relayer...</p>}
              {!isContractReady && <p className="stat-help">Set the deployed contract address to start playing.</p>}
            </div>
        </section>

        <section className="grid">
          <div className="card">
            <div className="card-head">
              <div>
                <p className="eyebrow">Step 1</p>
                <h3>Buy points</h3>
                <p className="muted">Convert ETH into private points to play multiple rounds.</p>
              </div>
            </div>
            <div className="form">
              <label className="label">ETH to convert</label>
              <div className="input-row">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={ethAmount}
                  onChange={(e) => setEthAmount(e.target.value)}
                  placeholder="0.05"
                />
                <button
                  className="primary"
                  onClick={handleBuyPoints}
                  disabled={isBuying || !isConnected || !isContractReady}
                >
                  {isBuying ? 'Processing...' : 'Buy points'}
                </button>
              </div>
              <p className="hint">1 ETH mints {formatNumber(exchangeRate)} points.</p>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <p className="eyebrow">Step 2</p>
                <h3>Roll encrypted dice</h3>
                <p className="muted">Choose big (4-6) or small (1-3). Your guess stays private.</p>
              </div>
            </div>
            <div className="guess-row">
              <button
                className={`pill-button ${selectedGuess === 1 ? 'active' : ''}`}
                onClick={() => setSelectedGuess(1)}
              >
                Big · 1
              </button>
              <button
                className={`pill-button ${selectedGuess === 2 ? 'active' : ''}`}
                onClick={() => setSelectedGuess(2)}
              >
                Small · 2
              </button>
            </div>
            <button
              className="primary full"
              onClick={handlePlayRound}
              disabled={isRolling || !isConnected || !isContractReady}
            >
              {isRolling ? 'Rolling...' : 'Send encrypted guess'}
            </button>
            <p className="hint">Win {formatNumber(rewardSize)} points for each correct prediction.</p>
          </div>

          <div className="card span-2">
            <div className="card-head">
              <div>
                <p className="eyebrow">Outcome</p>
                <h3>Latest round</h3>
                <p className="muted">Decrypt your dice, guess, and reward whenever you want.</p>
              </div>
              <button className="ghost-button" onClick={decryptLatest} disabled={!hasHandles || decrypting}>
                {decrypting ? 'Decrypting...' : 'Refresh decryption'}
              </button>
            </div>
            <div className="outcome-grid">
              <div className="stat">
                <p className="stat-label">Dice</p>
                <p className="stat-value">{lastDice ?? '—'}</p>
                <p className="stat-help">Random number from Zama FHE.</p>
              </div>
              <div className="stat">
                <p className="stat-label">Your guess</p>
                <p className="stat-value">
                  {lastGuess === 1 ? 'Big (1)' : lastGuess === 2 ? 'Small (2)' : '—'}
                </p>
                <p className="stat-help">Submitted privately through the relayer.</p>
              </div>
              <div className="stat">
                <p className="stat-label">Reward</p>
                <p className="stat-value">{formatNumber(lastReward)}</p>
                <p className="stat-help">+{formatNumber(rewardSize)} for a correct guess.</p>
              </div>
            </div>
            <div className="outcome-footer">
              <p className="lead">{lastOutcomeText}</p>
            </div>
          </div>
        </section>

        {(statusMessage || zamaError || errorMessage) && (
          <section className="messages">
            {statusMessage && <div className="banner success">{statusMessage}</div>}
            {zamaError && <div className="banner warning">{zamaError}</div>}
            {errorMessage && <div className="banner danger">{errorMessage}</div>}
          </section>
        )}
      </main>
    </div>
  );
}
