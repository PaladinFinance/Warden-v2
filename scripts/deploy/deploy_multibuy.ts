export { };
const hre = require("hardhat");

const ethers = hre.ethers;

const network = hre.network.name;

const params_path = () => {
    if (network === 'kovan') {
        return '../utils/kovan_params'
    }
    else {
        return '../utils/main_params'
    }
}

const param_file_path = params_path();

const {
    FEE_TOKEN_ADDRESS,
    VOTING_ESCROW_ADDRESS,
    DELEGATION_BOOST_ADDRESS,
    WARDEN_ADDRESS
} = require(param_file_path);


async function main() {

    console.log('Deploying WardenMultiBuy  ...')

    const deployer = (await hre.ethers.getSigners())[0];

    const MultiBuy = await ethers.getContractFactory("WardenMultiBuy");



    const multiBuy = await MultiBuy.deploy(
        FEE_TOKEN_ADDRESS,
        VOTING_ESCROW_ADDRESS,
        DELEGATION_BOOST_ADDRESS,
        WARDEN_ADDRESS
    );
    await multiBuy.deployed();

    console.log('Warden MultiBuy : ')
    console.log(multiBuy.address)



    await multiBuy.deployTransaction.wait(30);


    await hre.run("verify:verify", {
        address: multiBuy.address,
        constructorArguments: [
            FEE_TOKEN_ADDRESS,
            VOTING_ESCROW_ADDRESS,
            DELEGATION_BOOST_ADDRESS,
            WARDEN_ADDRESS
        ],
    });

}


main()
    .then(() => {
        process.exit(0);
    })
    .catch(error => {
        console.error(error);
        process.exit(1);
    });