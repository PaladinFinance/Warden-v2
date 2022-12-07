import { ethers } from "hardhat";
import { BigNumber } from "ethers";

export const BLOCK_NUMBER = 16133946

export const TOKEN_ADDRESS = "0xba100000625a3754423978a60c9317c58a424e3D"; //here : BAL

export const VOTING_ESCROW_ADDRESS = "0xC128a9954e6c874eA3d62ce62B468bA073093F25"; //here : veBAL

export const BOOST_DELEGATION_ADDRESS = "0x67F8DF125B796B05895a6dc8Ecf944b9556ecb0B"; //here : veBoost for veBAL

export const OLD_BOOST_DELEGATON_ADDRESS = "0xB496FF44746A8693A060FafD984Da41B253f6790";

export const BIG_HOLDER = "0x10A19e7eE7d7F8a52822f6817de8ea18204F2e4f"; //here : BAL holder

export const VETOKEN_LOCKING_TIME = BigNumber.from(86400 * 365).div(86400 * 7).mul(86400 * 7)

export const PAL_TOKEN_ADDRESS = "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF"; // PAL

export const PAL_HOLDER = "0x1Ae6DCBc88d6f81A7BCFcCC7198397D776F3592E"; // PAL holder (multisig)

export const TOKENS = [
    "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF", //here : PAL
    "0x6B175474E89094C44Da98b954EedeAC495271d0F", //here : DAI
]
export const HOLDERS = [
    "0x1Ae6DCBc88d6f81A7BCFcCC7198397D776F3592E", //here : PAL holder
    "0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8", //here : DAI holder
]
export const AMOUNTS = [
    ethers.utils.parseEther('15000000'),
    ethers.utils.parseEther('80000000')
]