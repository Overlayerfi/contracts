import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ETH_RPC, GOERLI_RPC, OVA_BETA_RPC, PRIVATE_ARB_SEPOLIA_RPC_PREFIX, PRIVATE_ETH_RPC_PREFIX, PRIVATE_ETH_SEPOLIA_RPC_PREFIX } from './rpc';
import 'solidity-docgen';
import { EndpointId } from '@layerzerolabs/lz-definitions'

dotenv.config({ path: process.cwd() + "/process.env"});

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
  gasReporter: {
    enabled: true,
    currency: 'USD',
    L1: "ethereum",
    L1Etherscan: process.env.ETHERSCAN_API_KEY!,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY!,
    //outputFile: 'gas-report.txt',
  },
  docgen: {
    output: 'docs',
    exclude: ['mock_ERC20', 'pancake', 'uniswap', 'curve', 'backing']
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY!,
    },
  },
  sourcify: {
    // Disabled by default
    // Doesn't need an API key
    enabled: true
  },
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 800,
          },
          // viaIR: true
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
        blockNumber: 22917626,
      },
      accounts: testAccounts,
      allowUnlimitedContractSize: true,
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
      accounts: [process.env.OVA_MAINNET_ROVA_DEPLOYER_KEY!],
      gas: "auto",
      gasPrice: "auto",
      allowUnlimitedContractSize: true,
    },
    eth_sepolia: {
      eid: EndpointId.SEPOLIA_V2_TESTNET,
      url: PRIVATE_ETH_SEPOLIA_RPC_PREFIX + process.env.ALCHEMY_KEY!,
      chainId: 0xAA36A7,
      accounts: [process.env.OVA_SEPOLIA_DEPLOYER_KEY!, process.env.OVA_SEPOLIA_TREASURY_KEY!],
      gasPrice: "auto",
      gas: "auto",
      allowUnlimitedContractSize: true,
    },
    arbitrum_sepolia: {
      eid: EndpointId.ARBITRUM_V2_TESTNET,
      url: PRIVATE_ARB_SEPOLIA_RPC_PREFIX + process.env.ALCHEMY_KEY!,
      chainId: 0x66eee,
      accounts: [process.env.OVA_SEPOLIA_DEPLOYER_KEY!, process.env.OVA_SEPOLIA_TREASURY_KEY!],
      gasPrice: "auto",
      gas: "auto",
      allowUnlimitedContractSize: true,
    }
  },
};

export default config;
