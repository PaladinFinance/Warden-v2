export { };
const hre = require("hardhat");

const ethers = hre.ethers;

const network = hre.network.name;

const VE_TOKEN = process.env.VE_TOKEN ? String(process.env.VE_TOKEN) : "VECRV";

const params_path = () => {
    if (network === 'fork') {
        return '../utils/fork_params'
    }
    else if(VE_TOKEN === "VESDT") {
        return '../utils/sdt_params'
    }
    else if(VE_TOKEN === "VEANGLE") {
        return '../utils/angle_params'
    }
    else if(VE_TOKEN === "VEBAL") {
        return '../utils/bal_params'
    }
    else {
        return '../utils/main_params'
    }
}

const param_file_path = params_path();

const {
    VOTING_ESCROW_ADDRESS,
    DELEGATION_BOOST_ADDRESS,
    CHEST_ADDRESS,
} = require(param_file_path);


async function main() {

    console.log('Deploying Warden Pledge ...')

    const min_vote_diff = ethers.utils.parseEther('1000')

    const Pledge = await ethers.getContractFactory("WardenPledge");

    const pledge = await Pledge.deploy(
        VOTING_ESCROW_ADDRESS,
        DELEGATION_BOOST_ADDRESS,
        CHEST_ADDRESS,
        min_vote_diff
    );
    await pledge.deployed();

    console.log('Warden Pledge : ')
    console.log(pledge.address)

    await pledge.deployTransaction.wait(30);

    if(network == "mainnet"){
        await hre.run("verify:verify", {
            address: pledge.address,
            constructorArguments: [
                VOTING_ESCROW_ADDRESS,
        DELEGATION_BOOST_ADDRESS,
        CHEST_ADDRESS,
        min_vote_diff
            ],
        });
    }

}


main()
    .then(() => {
        process.exit(0);
    })
    .catch(error => {
        console.error(error);
        process.exit(1);
    });