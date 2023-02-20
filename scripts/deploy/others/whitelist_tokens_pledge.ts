export { };
const hre = require("hardhat");
import { BigNumber } from "@ethersproject/bignumber";

const ethers = hre.ethers;

const network = hre.network.name;

const params_path = () => {
  if (network === 'fork') {
    return '../../utils/fork_params'
  }
  else {
    return '../../utils/main_params'
  }
}

const param_file_path = params_path();

const { 
    WARDEN_PLEDGE
} = require(param_file_path);

// Tokens params : 

const token_list = [
    "0xD533a949740bb3306d119CC777fa900bA034cd52",
    "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF",
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
]
const minTokenAmounts = [
    ethers.utils.parseEther('0.000000005'),
    ethers.utils.parseEther('0.000000001'),
    ethers.utils.parseEther('0.000000001'),
    BigNumber.from('1000')
]



async function main() {

    const deployer = (await hre.ethers.getSigners())[0];

    const WardenPledge = await ethers.getContractFactory("WardenPledge");

    const pledge = WardenPledge.attach(WARDEN_PLEDGE);

    console.log()
    console.log('Adding tokens to the list ...')
    let tx = await pledge.connect(deployer).addMultipleRewardToken(token_list, minTokenAmounts)
    await tx.wait(10)

    console.log()
    console.log('Done !')

}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });