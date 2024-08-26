const { ethers } = require("hardhat");


const FEE_TOKEN_ADDRESS =  "0xD533a949740bb3306d119CC777fa900bA034cd52"

const VOTING_ESCROW_ADDRESS =  "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2"

const DELEGATION_BOOST_ADDRESS = "0xD37A6aa3d8460Bd2b6536d608103D880695A23CD"

const FEE_RATIO = 500 // 5%

const MIN_PERCENT_REQUIRED = 1000 //10%

const ADVISED_PRICE = 793650793 // per vote per second

const CHEST_ADDRESS = "0x1Ae6DCBc88d6f81A7BCFcCC7198397D776F3592E"


//Deploys

const WARDEN_ADDRESS = "0xA04A36614e4C1Eb8cc0137d6d34eaAc963167828"

const WARDEN_MULTI_BUY_ADDRESS = "0x4772ca88A5BFA9d196472b208566fee948D272B3"

const WARDEN_LENS_ADDRESS = ""

//const WARDEN_PLEDGE_ADDRESS = "0x1F9c0288d57B0c1F2d7B2B15Fb91687aB1673a81"
//const WARDEN_PLEDGE_ADDRESS = "0x120AD8C6F3Ab20D759390bDe83EE761f1caF4E39"
const WARDEN_PLEDGE_ADDRESS = "0x62653343dEe0706894aF784Ee5f7cb83290d12d1"

module.exports = {
    FEE_TOKEN_ADDRESS,
    VOTING_ESCROW_ADDRESS,
    DELEGATION_BOOST_ADDRESS,
    FEE_RATIO,
    ADVISED_PRICE,
    CHEST_ADDRESS,
    MIN_PERCENT_REQUIRED,
    WARDEN_ADDRESS,
    WARDEN_MULTI_BUY_ADDRESS,
    WARDEN_LENS_ADDRESS,
    WARDEN_PLEDGE_ADDRESS,
};