const hre = require("hardhat");
import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { provider } = ethers;

require("dotenv").config();

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

export async function resetFork(block_number = 15169400) {
    await hre.network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
                jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/" + (process.env.ALCHEMY_API_KEY || ''),
                blockNumber: block_number
            },
          },
        ],
    });

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