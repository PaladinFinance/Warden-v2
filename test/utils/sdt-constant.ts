import { ethers } from "hardhat";
import { BigNumber } from "ethers";

export const BLOCK_NUMBER = 15820830

export const TOKEN_ADDRESS = "0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F"; //here : SDT

export const VOTING_ESCROW_ADDRESS = "0x0C30476f66034E11782938DF8e4384970B6c9e8a"; //here : veSDT

export const BOOST_DELEGATION_ADDRESS = "0x47B3262C96BB55A8D2E4F8E3Fed29D2eAB6dB6e9"; //here : veBoost for veSDT

export const OLD_BOOST_DELEGATON_ADDRESS = "0x0000000000000000000000000000000000000000";

export const BIG_HOLDER = "0x40B4B1a259d48d96F08F099Deb07eFad31A2eB2A"; //here : SDT holder

export const VETOKEN_LOCKING_TIME = BigNumber.from(86400 * 365 * 4).div(86400 * 7).mul(86400 * 7)

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