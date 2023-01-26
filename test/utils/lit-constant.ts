import { ethers } from "hardhat";
import { BigNumber } from "ethers";

export const BLOCK_NUMBER = 16492100

export const TOKEN_ADDRESS = "0xfd0205066521550D7d7AB19DA8F72bb004b4C341"; //here : LIT

export const VOTING_ESCROW_ADDRESS = "0xf17d23136B4FeAd139f54fB766c8795faae09660"; //here : veLIT

export const BOOST_DELEGATION_ADDRESS = "0x536FE6a7Fb8CAc9ac3fDA4374Eabd8833EFbB42a"; //here : veBoost for veLIT

export const OLD_BOOST_DELEGATON_ADDRESS = "0x0000000000000000000000000000000000000000";

export const BIG_HOLDER = "0x63F2695207f1d625a9B0B8178D95cD517bC5E82C"; //here : LIT holder

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