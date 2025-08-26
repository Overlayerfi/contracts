import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ETH_RPC, GOERLI_RPC, OVA_BETA_RPC, PRIVATE_ETH_RPC_PREFIX } from './rpc';

const testAccounts = [
  {
    privateKey: process.env.ADMIN_WALLET_KEY!,
    balance: "10000000000000000000000000",
  },
  {
    privateKey: process.env.TEAM_WALLET_KEY!,
    balance: "10000000000000000000",
  },
  {
    privateKey: process.env.USER_A_WALLET_KEY!,
    balance: "10000000000000000000",
  },
  {
    privateKey: process.env.USER_B_WALLET_KEY!,
    balance: "10000000000000000000",
  },
  {
    privateKey: process.env.USER_C_WALLET_KEY!,
    balance: "10000000000000000000",
  },
];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999,
          },
          viaIR: true
        },
      },
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999,
          },
        },
      },
      {
        version: '0.7.6',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1_000_000,
          },
          metadata: {
            bytecodeHash: 'none',
          },
        },
      }
    ]
  },
  defaultNetwork: "localhost",
  networks: {
    hardhat: {
      forking: {
        url: PRIVATE_ETH_RPC_PREFIX + process.env.ALCHEMY_KEY!,
        enabled: true,
        blockNumber: 19709557,
      },
      accounts: testAccounts,
      loggingEnabled: false,
    },
    ova: {
      url: OVA_BETA_RPC,
      chainId: 0x7A69,
      accounts: [process.env.ADMIN_WALLET_KEY!, process.env.TEAM_WALLET_KEY!],
      gas: "auto",
      gasPrice: "auto",
      allowUnlimitedContractSize: true,
    },
    eth: {
      url: ETH_RPC,
      chainId: 0x1,
      accounts: [process.env.ADMIN_WALLET_KEY!, process.env.TEAM_WALLET_KEY!],
      gas: "auto",
      gasPrice: "auto",
      allowUnlimitedContractSize: true,
    },
  },
};

export default config;
