const hre = require("hardhat");
import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as fs from 'fs';

import { VECRV_HOLDERS, PROOFS_BLOCK_NUMBER, TOKEN_ADDRESS } from "./constant";
import { TEST_URI } from "./network";

const { provider } = ethers;

require("dotenv").config();
const path = require("path");

// https://github.com/ethereum/go-ethereum/blob/master/core/types/block.go#L69
const BLOCK_HEADER = [
    "parentHash",
    "sha3Uncles",
    "miner",
    "stateRoot",
    "transactionsRoot",
    "receiptsRoot",
    "logsBloom",
    "difficulty",
    "number",
    "gasLimit",
    "gasUsed",
    "timestamp",
    "extraData",
    "mixHash",
    "nonce",
    "baseFeePerGas",  //added by EIP-1559 and is ignored in legacy headers
]

export async function getTimestamp(
    day: number,
    month: number,
    year: number,
    hours: number = 0,
    minutes: number = 0
) {
    let date = new Date(year, month, day, hours, minutes, 0)
    return Math.floor(date.getTime() / 1000)
}

export async function setBlockTimestamp(
    timestamp: string,
) {
    await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp])
    await hre.network.provider.send("evm_mine")
}

export async function resetFork(chainId: number) {
    let constants_path = "./constant"

    const { BLOCK_NUMBER } = require(constants_path);
    let blockNumber = BLOCK_NUMBER[chainId]

    await hre.network.provider.request({
        method: "hardhat_reset",
        params: [
            {
                chainId: chainId,
                forking: {
                    jsonRpcUrl: TEST_URI[chainId],
                    blockNumber: blockNumber
                },
            },
        ],
    });

}

export async function getVeHolders(
    admin: SignerWithAddress,
    number: number
) {
    let holders: SignerWithAddress[] = []

    for(let i = VECRV_HOLDERS.length - 1; i >= (VECRV_HOLDERS.length - number); i--){
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [VECRV_HOLDERS[i]],
        });

        await hre.network.provider.request({
            method: "hardhat_setBalance",
            params: [VECRV_HOLDERS[i], ethers.utils.parseEther("5500000000").toHexString()],
        });
    
        /*await admin.sendTransaction({
            to: VECRV_HOLDERS[i],
            value: ethers.utils.parseEther("1000"),
        });*/
    
        const holder = await ethers.getSigner(VECRV_HOLDERS[i])

        holders.push(holder)
    }

    return holders;

}

export async function getVeHolder(
    index: number
) {
    let holder: SignerWithAddress = await ethers.getSigner(VECRV_HOLDERS[index])

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [VECRV_HOLDERS[index]],
    });

    await hre.network.provider.request({
        method: "hardhat_setBalance",
        params: [VECRV_HOLDERS[index], ethers.utils.parseEther("5500000000").toHexString()],
    });

    return holder;

}

export async function setBlockhash(
    admin: SignerWithAddress,
    veStateOracle: Contract,
) {
    const stateOracle_owner = await veStateOracle.owner()

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [stateOracle_owner],
    });

    await hre.network.provider.request({
        method: "hardhat_setBalance",
        params: [stateOracle_owner, ethers.utils.parseEther("5500000000").toHexString()],
    });

    /*await admin.sendTransaction({
        to: stateOracle_owner,
        value: ethers.utils.parseEther("1000"),
    });*/

    const owner = await ethers.getSigner(stateOracle_owner)

    const block = require('../data/block.json')

    await veStateOracle.connect(owner).set_eth_blockhash(
        block["number"], block["hash"]
    );
}

export async function setHolderSidechainBalance(
    admin: SignerWithAddress,
    veStateOracle: Contract,
    holder: SignerWithAddress,
) {
    const block_header_rlp = '0x' + fs.readFileSync(path.resolve(__dirname, "../data/block_header_rlp-" + PROOFS_BLOCK_NUMBER.toString() + ".txt"), 'utf8');
    const proof_rlp = '0x' + fs.readFileSync(path.resolve(__dirname, "../data/proof_rlp-" + PROOFS_BLOCK_NUMBER.toString() + "-" + holder.address.toString() + ".txt"), 'utf8');

    await veStateOracle.connect(admin).submit_state(
        holder.address,
        block_header_rlp,
        proof_rlp
    );
}

export async function advanceTime(
    seconds: number
) {
    await hre.network.provider.send("evm_increaseTime", [seconds])
    await hre.network.provider.send("evm_mine")
}

export async function getERC20(
    admin: SignerWithAddress,
    holder: string,
    erc20_contract: Contract,
    recipient: string,
    amount: BigNumber
) {

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [holder],
    });

    await admin.sendTransaction({
        to: holder,
        value: ethers.utils.parseEther("10"),
    });

    const signer = await ethers.getSigner(holder)

    await erc20_contract.connect(signer).transfer(recipient, amount);

    await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [holder],
    });
}

export async function stopAutoMine() {
    await hre.network.provider.send("evm_setAutomine", [false]);
    await hre.network.provider.send("evm_setIntervalMining", [0]);
}

export async function startAutoMine() {
    await hre.network.provider.send("evm_setAutomine", [true]);
}

export async function mineNextBlock() {
    await hre.network.provider.send("evm_mine")
}