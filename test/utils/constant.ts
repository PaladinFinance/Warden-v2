import { ethers } from "hardhat";
import { BigNumber } from "ethers";

export const BLOCK_NUMBER = 20312437

export const TOKEN_ADDRESS = "0xD533a949740bb3306d119CC777fa900bA034cd52"; //here : CRV

export const VOTING_ESCROW_ADDRESS = "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2"; //here : veCRV

export const BOOST_DELEGATION_ADDRESS = "0xD37A6aa3d8460Bd2b6536d608103D880695A23CD"; //here : veBoost for veCRV

export const OLD_BOOST_DELEGATON_ADDRESS = "0x0000000000000000000000000000000000000000"; // not useleful here

export const BIG_HOLDER = "0x5a52E96BAcdaBb82fd05763E25335261B270Efcb"; //here : CRV holder

export const VETOKEN_LOCKING_TIME = BigNumber.from(86400 * 365 * 4).div(86400 * 7).mul(86400 * 7)

export const PAL_TOKEN_ADDRESS = "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF"; // PAL

export const PAL_HOLDER = "0x1Ae6DCBc88d6f81A7BCFcCC7198397D776F3592E"; // PAL holder (multisig)

export const TOKENS = [
    "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF", //here : PAL
    "0x6B175474E89094C44Da98b954EedeAC495271d0F", //here : DAI
]
export const HOLDERS = [
    "0x1Ae6DCBc88d6f81A7BCFcCC7198397D776F3592E", //here : PAL holder
    "0xBF293D5138a2a1BA407B43672643434C43827179", //here : DAI holder
]
export const AMOUNTS = [
    ethers.utils.parseEther('15000000'),
    ethers.utils.parseEther('35000000')
]