const { ethers } = require("hardhat");


const FEE_TOKEN_ADDRESS =  "0xD533a949740bb3306d119CC777fa900bA034cd52"

const VOTING_ESCROW_ADDRESS =  "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2"

const DELEGATION_BOOST_ADDRESS = "0xD0921691C7DEBc698e6e372c6f74dc01fc9d3778"

const FEE_RATIO = 500 // 5%

const MIN_PERCENT_REQUIRED = 1000 //10%

const ADVISED_PRICE = 165343910

const CHEST_ADDRESS = "0x0482A2d6e2F895125b7237de70c675cd55FE17Ca"


//Deploys

const WARDEN_ADDRESS = ""

const WARDEN_MULTI_BUY_ADDRESS = ""

const WARDEN_LENS_ADDRESS = ""

//const WARDEN_PLEDGE = "0x09F818fD47b0D4CFD139786026739d79Bb7738a4" // Tenderly fork
const WARDEN_PLEDGE = "0xb24E091616Cb4512Ab9C792d629Dd87bB528D6fe" // Custom Fork 47

/* Tenderly fork last tests : 
const WARDEN_PLEDGE_SDT = "0x5796d6346b515cc3997e764dd32103f9ae09fb80"
*/

module.exports = {
    FEE_TOKEN_ADDRESS,
    VOTING_ESCROW_ADDRESS,
    DELEGATION_BOOST_ADDRESS,
    FEE_RATIO,
    ADVISED_PRICE,
    MIN_PERCENT_REQUIRED,
    WARDEN_ADDRESS,
    WARDEN_MULTI_BUY_ADDRESS,
    WARDEN_LENS_ADDRESS,
    CHEST_ADDRESS,
    WARDEN_PLEDGE,
};