import * as dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";
import { OVA_BETA_RPC, PRIVATE_ARB_SEPOLIA_RPC_PREFIX, PRIVATE_BASE_RPC_PREFIX, PRIVATE_BASE_SEPOLIA_RPC_PREFIX, PRIVATE_ETH_RPC_PREFIX, PRIVATE_ETH_SEPOLIA_RPC_PREFIX } from './rpc';
import { EndpointId } from '@layerzerolabs/lz-definitions'

dotenv.config({ path: process.cwd() + "/process.env"});

type HardhatEthersUtils = {
  formatTransactionResponse: (value: any) => unknown;
};

const hardhatEthersUtils = require("@nomicfoundation/hardhat-ethers/internal/ethers-utils") as HardhatEthersUtils;
const originalFormatTransactionResponse = hardhatEthersUtils.formatTransactionResponse;

hardhatEthersUtils.formatTransactionResponse = (value: any) => {
  if (value?.to === "") {
    value = { ...value, to: null };
  }

  return originalFormatTransactionResponse(value);
};

require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-toolbox/network-helpers");
require("solidity-docgen");

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
    exclude: [
      'ambassador',
      'curve', 
      'faucet', 
      'liquidity', 
      'mock_ERC20', 
      'overlayerbacking', 
      'sepolialottery', 
      'shared', 
      'pancake', 
      'uniswap', 
      'test', 
      'whitelist',
      'overlayer/rOVA.sol',
      'overlayer/rOVAV2.sol',
      'overlayer/OVA.sol',
      'overlayer/OverlayerReferral.sol',
      'overlayer/OverlayerWrapFactory.sol',
      'overlayer/interfaces/IOverlayerReferral.sol'
    ],
    pages: 'files'
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
            runs: 250,
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
      url: PRIVATE_ETH_RPC_PREFIX + process.env.ALCHEMY_KEY!,
      chainId: 0x1,
      accounts: [process.env.OVERLAYER_HEAD_OP_KEY!],
      gas: "auto",
      gasPrice: "auto",
      allowUnlimitedContractSize: true,
    },
    base: {
      url: PRIVATE_BASE_RPC_PREFIX + process.env.ALCHEMY_KEY!,
      chainId: 0x2105,
      accounts: [process.env.OVERLAYER_HEAD_OP_KEY!],
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
    base_sepolia: {
      eid: EndpointId.BASESEP_V2_TESTNET,
      url: PRIVATE_BASE_SEPOLIA_RPC_PREFIX + process.env.ALCHEMY_KEY!,
      chainId: 0x14a34,
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
