import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";

dotenv.config({ path: process.cwd() + "/scripts/process.env"});

const testAccounts = [
  {
    privateKey: process.env.ADMIN_WALLET_KEY!,
    balance: "1000000000000000000000000000000000000000000",
  },
  {
    privateKey: process.env.TEAM_WALLET_KEY!,
    balance: "1000000000000000000000000000000000000000000",
  },
  {
    privateKey: process.env.USER_A_WALLET_KEY!,
    balance: "1000000000000000000000000000000000000000000",
  },
  {
    privateKey: process.env.USER_B_WALLET_KEY!,
    balance: "1000000000000000000000000000000000000000000",
  },
  {
    privateKey: process.env.USER_C_WALLET_KEY!,
    balance: "1000000000000000000000000000000000000000000",
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
            runs: 999999,
          },
        },
      }
    ]
  },
  defaultNetwork: "localhost",
  networks: {
    // Configure each network to the respective Cronos instances
    hardhat: {
      //forking: {
      //  url: "https://evm.cronos.org",
      //  enabled: true,
      //  blockNumber: 5168517,
      //},
      accounts: testAccounts,
    },
    //cronosMainnet: {
    //  url: "https://evm.cronos.org",
    //  chainId: 25,
    //  accounts: [process.env.AEGIS_MANAGER_KEY!],
    //  gas: "auto",
    //  gasPrice: "auto",
    //  allowUnlimitedContractSize: true,
    //},
    //cronosTestnet: {
    //  url: "https://evm-t3.cronos.org",
    //  chainId: 338,
    //  accounts: [process.env.AEGIS_MANAGER_KEY!],
    //  gas: "auto",
    //  gasPrice: "auto",
    //  allowUnlimitedContractSize: true,
    //},
    //avaxTestnet: {
    //  url: "https://api.avax-test.network/ext/bc/C/rpc",
    //  chainId: 43113,
    //  accounts: [process.env.AEGIS_MANAGER_KEY!],
    //  gas: "auto",
    //  gasPrice: "auto",
    //  allowUnlimitedContractSize: true,
    //},
  },
};

export default config;
