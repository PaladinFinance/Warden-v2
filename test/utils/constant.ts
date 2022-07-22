import { ethers } from "hardhat";
import { BigNumber } from "ethers";

export const TOKEN_ADDRESS = "0xD533a949740bb3306d119CC777fa900bA034cd52"; //here : CRV

export const VOTING_ESCROW_ADDRESS = "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2"; //here : veCRV

export const BOOST_DELEGATION_ADDRESS = "0xD0921691C7DEBc698e6e372c6f74dc01fc9d3778"; //here : veBoost for veCRV

export const BIG_HOLDER = "0x32D03DB62e464c9168e41028FFa6E9a05D8C6451"; //here : CRV holder

export const VECRV_LOCKING_TIME = Math.floor((86400 * 365 * 4) / (86400 * 7)) * (86400 * 7)

export const PAL_TOKEN_ADDRESS = "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF"; // PAL

export const PAL_HOLDER = "0x1Ae6DCBc88d6f81A7BCFcCC7198397D776F3592E"; // PAL holder (multisig)
