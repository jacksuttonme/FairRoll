import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <div className="brand">
          <div className="brand-mark">🎲</div>
          <div>
            <p className="eyebrow">Zama FHE dice</p>
            <h1 className="header-title">FairRoll</h1>
            <p className="subtitle">Encrypted rolls, provable rewards</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="network-pill">Sepolia · FHE</span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
