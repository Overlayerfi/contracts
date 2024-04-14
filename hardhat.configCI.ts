import * as dotenv from 'dotenv';
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-web3";
import '@openzeppelin/hardhat-upgrades';

console.log('🚨 Change the env file in production 🚨');
dotenv.config({path: process.cwd() + '/scripts/processCI.env'});

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999
          }
        }
      },
      {
        version: "0.8.18",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100
          }
        }
      },
    ]

  },
  defaultNetwork: 'hardhat',
  networks: {
    // Configure each network to the respective Cronos instances
    hardhat: {
      //forking: {
      //  url: "https://evm.cronos.org",
      //  enabled: true,
      //  blockNumber: 5168517,
      //},
      accounts: [
        {
          privateKey: process.env.AEGIS_MANAGER_KEY!, //same as strat owner
          balance: '1000000000000000000000000000000000000000000'
        },
        {
          privateKey: process.env.AEGIS_TREASURY_KEY!,
          balance: '1000000000000000000000000000000000000000000'
        },
        {
          privateKey: process.env.USER_A_KEY!,
          balance: '1000000000000000000000000000000000000000000'
        },
        {
          privateKey: process.env.USER_B_KEY!,
          balance: '1000000000000000000000000000000000000000000'
        },
        {
          privateKey: process.env.USER_C_KEY!,
          balance: '1000000000000000000000000000000000000000000'
        },
        {
          privateKey: process.env.USER_D_KEY!,
          balance: '1000000000000000000000000000000000000000000'
        },
        {
          privateKey: process.env.USER_E_KEY!,
          balance: '1000000000000000000000000000000000000000000'
        }
      ],
    },
    cronosMainnet: {
      url: 'https://evm.cronos.org',
      chainId: 25,
      accounts: [process.env.AEGIS_MANAGER_KEY!],
      gas: 'auto',
      gasPrice: 'auto',
      allowUnlimitedContractSize: true
    },
    cronosTestnet: {
      url: 'https://evm-t3.cronos.org',
      chainId: 338,
      accounts: [process.env.AEGIS_MANAGER_KEY!],
      gas: 'auto',
      gasPrice: 'auto',
      allowUnlimitedContractSize: true
    },
    avaxTestnet: {
      url: 'https://api.avax-test.network/ext/bc/C/rpc',
      chainId: 43113,
      accounts: [process.env.AEGIS_MANAGER_KEY!],
      gas: 'auto',
      gasPrice: 'auto',
      allowUnlimitedContractSize: true
    },
  },
};

export default config;

