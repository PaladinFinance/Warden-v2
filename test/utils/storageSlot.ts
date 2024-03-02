const hre = require("hardhat");
import { ethers } from "hardhat";
const IERC20ABI = require('../../abi/IERC20.json');

require("dotenv").config();

const { provider } = ethers;

async function findBalancesSlot(tokenAddress: string) {
    await hre.network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
                jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/" + (process.env.ALCHEMY_API_KEY || ''),
                blockNumber: 19343700
            },
          },
        ],
    });

    const encode = (types: string[], values: any[]) =>
        ethers.utils.defaultAbiCoder.encode(types, values);

    const account = "0x0D460F4f14DF593E2F6f88099396BC9F8AbFc5a1";
    const probeA = encode(['uint'], [1]);
    const probeB = encode(['uint'], [2]);

    const token = new ethers.Contract(tokenAddress, IERC20ABI, provider);

    for (let i = 0; i < 100; i++) {
        let probedSlot = ethers.utils.keccak256(
            encode(['address', 'uint'], [account, i])
        );

        
        // remove padding for JSON RPC
        while (probedSlot.startsWith('0x0'))
            probedSlot = '0x' + probedSlot.slice(3);

        const prev = await hre.network.provider.send(
            'eth_getStorageAt',
            [tokenAddress, probedSlot, 'latest']
        );

        // make sure the probe will change the slot value
        const probe = prev === probeA ? probeB : probeA;

        await hre.network.provider.send("hardhat_setStorageAt", [
            tokenAddress,
            probedSlot,
            probe
        ]);

        const balance = await token.balanceOf(account);

        // reset to previous value
        await hre.network.provider.send("hardhat_setStorageAt", [
            tokenAddress,
            probedSlot,
            prev
        ]);

        if (balance.eq(ethers.BigNumber.from(probe)))
            return i;
    }

    throw 'Balances slot not found!';
}

(async () => {

    const token_address = "0xEC6B8A3F3605B083F7044C0F31f2cac0caf1d469"

    const slot = await findBalancesSlot(token_address)
    console.log(slot)

})();