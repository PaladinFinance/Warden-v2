import { HardhatUserConfig } from "hardhat/types";

import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-contract-sizer";
import "@nomiclabs/hardhat-etherscan";
import "solidity-coverage";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-vyper";

import { BLOCK_NUMBER } from "./test/utils/constant";
import { TEST_URI } from "./test/utils/network";

require("dotenv").config();

// Defaults to CHAINID=1 so things will run with mainnet fork if not specified
const CHAINID = process.env.CHAINID ? Number(process.env.CHAINID) : 137;


const TEST_MNEMONIC = "test test test test test test test test test test test junk";
const TEST_ACCOUNT = { mnemonic: TEST_MNEMONIC, }


const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        }
      }
    ],
    overrides: {},
  },
  vyper: {
    version: "0.3.3",
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  networks: {
    hardhat: {
      chainId: CHAINID,
      forking: {
        url: TEST_URI[CHAINID],
        blockNumber: BLOCK_NUMBER[CHAINID]
      },
    },
    mainnet: {
      url: process.env.MAINNET_URI || '',
      accounts: process.env.MAINNET_PRIVATE_KEY ? [process.env.MAINNET_PRIVATE_KEY] : TEST_ACCOUNT,
    },
    fork: {
      url: process.env.FORK_URI || '',
      accounts: process.env.FORK_PRIVATE_KEY ? [process.env.FORK_PRIVATE_KEY] : TEST_ACCOUNT,
    },
  },
  mocha: {
    timeout: 0
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY || ''
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5"
  },
  gasReporter: {
    enabled: true
  }
};

export default config;
