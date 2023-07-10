import { task } from 'hardhat/config';
import { utils as EthersUtils, ethers, Contract } from 'ethers';

require("dotenv").config();

const IERC20ABI = require('../../abi/IERC20.json');

const loadERC20 = async (address: string, provider: any) => {
    return await new Contract(address, IERC20ABI, provider);
}

task('fork-get-all-ERC20', 'Steal ERC20 amount from holder to send to receiver on the Fork')
    .addPositionalParam(
        'receiver',
        'User address'
    )
    .setAction(async ({receiver}, hre) => {

        const token_list = [
            {
                address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", //DAI
                amount: "250000000",
                holder: "0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8"
            },
            {
                address: "0xD533a949740bb3306d119CC777fa900bA034cd52", //CRV
                amount: "5000000",
                holder: "0x32D03DB62e464c9168e41028FFa6E9a05D8C6451"
            },
            {
                address: "0xba100000625a3754423978a60c9317c58a424e3D", //BAL
                amount: "1250000",
                holder: "0x740a4AEEfb44484853AA96aB12545FC0290805F3"
            },
        ]

        if (hre.network.name != 'fork') {
            console.log('Wrong network - Connect to Fork')
            process.exit(1)
        }

        const provider = new ethers.providers.JsonRpcProvider(process.env.FORK_URI)
        // @ts-ignore
        hre.ethers.provider = provider

        const getERC20 = async (token: string, amount: string, holder: string) => {

            const ERC20 = await loadERC20(token, provider);

            console.log("Token", token)
            console.log("Sending", amount, " tokens to", receiver)
        
            await hre.network.provider.request({
                method: "hardhat_setBalance",
                params: [holder, EthersUtils.parseEther("50000000").toHexString()],
            });

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [holder],
            });
            // @ts-ignore
            const signer = await hre.ethers.getSigner(holder)
        
            await ERC20.connect(signer).transfer(receiver, EthersUtils.parseEther(amount));
        
            await hre.network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [holder],
            });

        }

        for(let t of token_list){
            await getERC20(t.address, t.amount, t.holder)

            console.log()
        }

    })