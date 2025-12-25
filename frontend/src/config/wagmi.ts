import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'FairRoll',
  projectId: '1b6a52d39799606245a237fb0dd2a6e2',
  chains: [sepolia],
  ssr: false,
});
