import { CHAINID } from "./constant";

require("dotenv").config();

export const TEST_URI: { [key:string]: string; } = {
    [CHAINID.AVAX]: "https://api.avax.network/ext/bc/C/rpc",
    [CHAINID.POLYGON]: "https://polygon-mainnet.g.alchemy.com/v2/" + (process.env.POLYGON_ALCHEMY_API_KEY || ''),
    [CHAINID.FANTOM]: "https://rpc.ftm.tools/",
    [CHAINID.OPTIMISM]: "https://opt-mainnet.g.alchemy.com/v2/" + (process.env.OPTIMISM_ALCHEMY_API_KEY || ''),
    [CHAINID.ARBITRUM]: "https://arb-mainnet.g.alchemy.com/v2/" + (process.env.ARBITRUM_ALCHEMY_API_KEY || ''),
    [CHAINID.XCHAIN]: "https://rpc.xdaichain.com/",
};