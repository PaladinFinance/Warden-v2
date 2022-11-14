import { BigNumber, utils } from "ethers";

export enum CHAINID {
    AVAX = 43114,
    POLYGON = 137,
    FANTOM = 250,
    OPTIMISM = 10,
    ARBITRUM = 42161,
    XCHAIN = 100
}

export const BLOCK_NUMBER: { [key:string]: number|undefined; } = {
    [CHAINID.AVAX]: 0,
    [CHAINID.POLYGON]: 35328260,
    [CHAINID.FANTOM]: 0,
    [CHAINID.OPTIMISM]: undefined,
    [CHAINID.ARBITRUM]: 0,
    [CHAINID.XCHAIN]: 0,
};

export const TOKEN_ADDRESS: { [key:string]: string; } = {
    [CHAINID.AVAX]: "0x47536F17F4fF30e64A96a7555826b8f9e66ec468",
    [CHAINID.POLYGON]: "0x172370d5Cd63279eFa6d502DAB29171933a610AF",
    [CHAINID.FANTOM]: "0x1E4F97b9f9F913c46F1632781732927B9019C68b",
    [CHAINID.OPTIMISM]: "0x0994206dfE8De6Ec6920FF4D779B0d950605Fb53",
    [CHAINID.ARBITRUM]: "0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978",
    [CHAINID.XCHAIN]: "",
}

export const VOTING_ESCROW_ADDRESS: { [key:string]: string; } = {
    [CHAINID.AVAX]: "0x12F407340697Ae0b177546E535b91A5be021fBF9",
    [CHAINID.POLYGON]: "0x12F407340697Ae0b177546E535b91A5be021fBF9",
    [CHAINID.FANTOM]: "0x12F407340697Ae0b177546E535b91A5be021fBF9",
    [CHAINID.OPTIMISM]: "0x12F407340697Ae0b177546E535b91A5be021fBF9",
    [CHAINID.ARBITRUM]: "0x12F407340697Ae0b177546E535b91A5be021fBF9",
    [CHAINID.XCHAIN]: "0x12F407340697Ae0b177546E535b91A5be021fBF9",
}

export const BOOST_DELEGATION_ADDRESS: { [key:string]: string; } = {
    [CHAINID.AVAX]: "",
    [CHAINID.POLYGON]: "0xb5ACC710AEDE048600E10eEDcefDf98d4aBf4B1E",
    [CHAINID.FANTOM]: "",
    [CHAINID.OPTIMISM]: "",
    [CHAINID.ARBITRUM]: "0x98c80fa823759B642C3E02f40533C164f40727ae",
    [CHAINID.XCHAIN]: "",
}

export const BIG_HOLDER: { [key:string]: string; } = {
    [CHAINID.AVAX]: "",
    [CHAINID.POLYGON]: "0x06959153B974D0D5fDfd87D561db6d8d4FA0bb0B",
    [CHAINID.FANTOM]: "",
    [CHAINID.OPTIMISM]: "",
    [CHAINID.ARBITRUM]: "",
    [CHAINID.XCHAIN]: "",
}

export const VECRV_LOCKING_TIME = BigNumber.from(86400 * 365 * 4).div(86400 * 7).mul(86400 * 7)

export const REWARD_TOKEN_ADDRESS: { [key:string]: string; } = {
    [CHAINID.AVAX]: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", //here : DAI
    [CHAINID.POLYGON]: "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1",
    [CHAINID.FANTOM]: "0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E", //here : DAI
    [CHAINID.OPTIMISM]: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", //here : DAI
    [CHAINID.ARBITRUM]: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", //here : USDC
    [CHAINID.XCHAIN]: "",
}

export const REWARD_HOLDER: { [key:string]: string; } = {
    [CHAINID.AVAX]: "0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D",
    [CHAINID.POLYGON]: "0x000000000000000000000000000000000000dEaD",
    [CHAINID.FANTOM]: "0xd652776de7ad802be5ec7bebfafda37600222b48",
    [CHAINID.OPTIMISM]: "0x1337bedc9d22ecbe766df105c9623922a27963ec",
    [CHAINID.ARBITRUM]: "0x892785f33cdee22a30aef750f285e18c18040c3e",
    [CHAINID.XCHAIN]: "",
}

export const TOKENS: { [key:string]: string[]; } = {
    /*[CHAINID.ETH_MAINNET]: [
        "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF", //here : PAL
        "0x6B175474E89094C44Da98b954EedeAC495271d0F", //here : DAI
    ],*/
    [CHAINID.AVAX]: [
        "", //here : x
        "", //here : x
    ],
    [CHAINID.POLYGON]: [
        "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1", //here : miMATIC
        "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7", //here : GHST
    ],
    [CHAINID.FANTOM]: [
        "", //here : x
        "", //here : x
    ],
    [CHAINID.OPTIMISM]: [
        "", //here : x
        "", //here : x
    ],
    [CHAINID.ARBITRUM]: [
        "", //here : x
        "", //here : x
    ],
    [CHAINID.XCHAIN]: [
        "", //here : x
        "", //here : x
    ],
}

export const HOLDERS: { [key:string]: string[]; } = {
    /*[CHAINID.ETH_MAINNET]: [
        "0x1Ae6DCBc88d6f81A7BCFcCC7198397D776F3592E", //here : PAL holder
        "0x8EB8a3b98659Cce290402893d0123abb75E3ab28", //here : DAI holder
    ],*/
    [CHAINID.AVAX]: [
        "", //here : x
        "", //here : x
    ],
    [CHAINID.POLYGON]: [
        "0x000000000000000000000000000000000000dEaD", //here : x
        "0xF977814e90dA44bFA03b6295A0616a897441aceC", //here : x
    ],
    [CHAINID.FANTOM]: [
        "", //here : x
        "", //here : x
    ],
    [CHAINID.OPTIMISM]: [
        "", //here : x
        "", //here : x
    ],
    [CHAINID.ARBITRUM]: [
        "", //here : x
        "", //here : x
    ],
    [CHAINID.XCHAIN]: [
        "", //here : x
        "", //here : x
    ],
}

export const AMOUNTS: { [key:string]: BigNumber[]; } = {
    /*[CHAINID.ETH_MAINNET]: [
        utils.parseEther('15000000'),
        utils.parseEther('80000000')
    ],*/
    [CHAINID.AVAX]: [
        utils.parseEther('0'),
        utils.parseEther('0')
    ],
    [CHAINID.POLYGON]: [
        utils.parseEther('75000000'),
        utils.parseEther('3500000')
    ],
    [CHAINID.FANTOM]: [
        utils.parseEther('0'),
        utils.parseEther('0')
    ],
    [CHAINID.OPTIMISM]: [
        utils.parseEther('0'),
        utils.parseEther('0')
    ],
    [CHAINID.ARBITRUM]: [
        utils.parseEther('0'),
        utils.parseEther('0')
    ],
    [CHAINID.XCHAIN]: [
        utils.parseEther('0'),
        utils.parseEther('0')
    ],
}

export const VECRV_HOLDERS = [
    "0x7a16ff8270133f063aab6c9977183d9e72835428",
    "0xf89501b77b2fa6329f94f5a05fe84cebb5c8b1a0",
    "0x9b44473e223f8a3c047ad86f387b80402536b029",
    "0x431e81e5dfb5a24541b5ff8762bdef3f32f96354",
    "0x425d16b0e08a28a3ff9e4404ae99d78c0a076c5a",
    "0x32d03db62e464c9168e41028ffa6e9a05d8c6451",
    "0xb18fbfe3d34fdc227eb4508cde437412b6233121",
    "0x394a16eea604fbd86b0b45184b2d790c83a950e3",
    "0xc72aed14386158960d0e93fecb83642e68482e4b",
    "0x9c5083dd4838e120dbeac44c052179692aa5dac5",
]

export const PROOFS_BLOCK_NUMBER = 14297900;