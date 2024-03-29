const { ethers } = require("hardhat");


const FEE_TOKEN_ADDRESS =  "0x31429d1856aD1377A8A0079410B297e1a9e214c2"

const VOTING_ESCROW_ADDRESS =  "0x0C462Dbb9EC8cD1630f1728B2CFD2769d09f0dd5"

const DELEGATION_BOOST_ADDRESS = "0x411E140dA9aece566C783c38eAc9C4a1eD846F29"

const FEE_RATIO = 500 // 5%

const MIN_PERCENT_REQUIRED = 1000 //10%

const ADVISED_PRICE = 1488095238 // per vote per second => eqv to 0.0009 fee token / week / vote delegated

const CHEST_ADDRESS = "0x0482A2d6e2F895125b7237de70c675cd55FE17Ca"


//Deploys

const WARDEN_ADDRESS = "0xaB68ed2A400a5bCa49bF71703522C5Ab766E3A44"

const WARDEN_MULTI_BUY_ADDRESS = "0x8c08448C20267621594027F92ab6990B446bea91"

const WARDEN_PLEDGE_ADDRESS = ""

module.exports = {
    FEE_TOKEN_ADDRESS,
    VOTING_ESCROW_ADDRESS,
    DELEGATION_BOOST_ADDRESS,
    FEE_RATIO,
    ADVISED_PRICE,
    MIN_PERCENT_REQUIRED,
    WARDEN_ADDRESS,
    WARDEN_MULTI_BUY_ADDRESS,
    WARDEN_PLEDGE_ADDRESS,
};