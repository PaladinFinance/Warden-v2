import { ethers } from "hardhat";
import { BigNumber } from "ethers";

export const BLOCK_NUMBER = 19348000

export const TOKEN_ADDRESS = "0x365AccFCa291e7D3914637ABf1F7635dB165Bb09"; //here : FXN

export const VOTING_ESCROW_ADDRESS = "0xEC6B8A3F3605B083F7044C0F31f2cac0caf1d469"; //here : veFXN

export const BOOST_DELEGATION_ADDRESS = "0x8Cc02c0D9592976635E98e6446ef4976567E7A81"; //here : veBoost for veFXN

export const BIG_HOLDER = "0x331174A9067e864A61B2F87861CCf006eD3bC95D"; //here : FXN holder

export const VETOKEN_LOCKING_TIME = BigNumber.from(86400 * 365 * 4).div(86400 * 7).mul(86400 * 7)

export const TOKENS = [
    "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF", //here : PAL
    "0x6B175474E89094C44Da98b954EedeAC495271d0F", //here : DAI
]
export const HOLDERS = [
    "0x1Ae6DCBc88d6f81A7BCFcCC7198397D776F3592E", //here : PAL holder
    "0x60FaAe176336dAb62e284Fe19B885B095d29fB7F", //here : DAI holder
]
export const AMOUNTS = [
    ethers.utils.parseEther('15000000'),
    ethers.utils.parseEther('125000000')
]