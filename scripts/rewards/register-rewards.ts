export { };
const { ethers } = require("ethers");
import { BigNumber } from "@ethersproject/bignumber";

const WardenABI = require('../abi/Warden.json');
const OldWardenABI = require('../abi/Old_Warden.json');
const veBoostv2ABI = require('../abi/veBoostv2.json');

const { WARDEN_ADDRESS, DELEGATION_BOOST_ADDRESS } = require('../utils/main_params');

const OLD_WARDEN_ADDRESS = "0x2e2f6aece0B7Caa7D3BfDFb2728F50b4e211F1eB"

const provider = new ethers.providers.JsonRpcProvider("https://eth-mainnet.alchemyapi.io/v2/" + (process.env.ALCHEMY_API_KEY || ''));

const start_block = 15300315
const end_block = 15484800 // !!!! to change
const punishement_end_block = 0

const old_warden_check_block = 15167600 //when we closed the market


type RegisteredUser = {
    percentage: BigNumber;
    start_block: number;
    expired: boolean;
    points: BigNumber;
}

type ForeignBoost = {
    start_ts: BigNumber;
    bias: BigNumber;
    slope: BigNumber;
}

const rewarded_users: string[] = []
const old_registered_users: string[] = []
let user_registrations = new Map<string, RegisteredUser>();
let user_foreign_boosts = new Map<string, ForeignBoost[]>();

const sum_total_points = BigNumber.from('0')

const total_rewards = BigNumber.from('50000')



async function main() {

    const Warden = new ethers.Contract(WARDEN_ADDRESS, WardenABI, provider);
    const OldWarden = new ethers.Contract(OLD_WARDEN_ADDRESS, OldWardenABI, provider);

    const Boostv2 = new ethers.Contract(DELEGATION_BOOST_ADDRESS, veBoostv2ABI, provider);

    // Get all Boost events from veBoost
    // Get all purchases from Warden
    // => how to check if they are not coming from old Warden

    // List all users that registered on old version
    // + filter for the one that quit before end of the market
    const old_registers = await OldWarden.queryFilter(OldWarden.filters.Registred(), 13992370, old_warden_check_block)
    for(let r of old_registers){
        const user_addr = r.args['user'];

        const still_registered = !(await OldWarden.userIndex(user_addr, { blockTag: old_warden_check_block })).eq(0)

        if(still_registered && (!old_registered_users.includes(user_addr))) old_registered_users.push(user_addr)
    }

    // Get all v2 Registered users (events)
    const registers = await Warden.queryFilter(Warden.filters.Registred(), start_block, end_block)

    for(let r of old_registers){
        const user_addr = r.args['user'];

        // to avoid any double count of an user
        if(rewarded_users.includes(user_addr)) continue;

        // filter the users that quit already
        const quitted = (await Warden.userIndex(user_addr, { blockTag: end_block })).eq(0)
        if(quitted) continue;

        // create Register struct for each based on current data
        // (consider start date of Registry but current Offer params if was updated ??)
        const event_blocknomber = (await r.getBlock()).nomber
        let registration: RegisteredUser = {
            percentage: BigNumber.from(0),
            start_block: event_blocknomber,
            expired: false,
            points: BigNumber.from(0),
        }

        // user base 100 points per veCRV registered in the market

        // calculate user ratio based on start block w/ the user Registration block
        // => ratio between user join block compared to start block
        // => reduce the user points the user had based on that ratio

        // apply multiplier on user points if was registered on Old Warden (x1.1 ?)

        // punishement if not Registered anymore 2 weeks after end of rewards period
        // (punishement ratio ? 33%? 50? removed ?)

        // punishement if users balance used in Boost outside of Warden
        // before Registering or during incentives
        // ( if user has a non-Warden-Boost related to him )
        // => slash by delegated amount based on that Boost compared to balance when Registering
        // (see if impacts available balance, based on user allowed percentage & delegated amount at that time)

        // save user points + add them to the sum

        rewarded_users.push(user_addr)
    }

    // 2nd scoring object, based on total points & user points
    // w/ amount of token to receive based on user points

    // Generate Merkle Tree from that scoring

}


main()
    .then(() => {
        process.exit(0);
    })
    .catch(error => {
        console.error(error);
        process.exit(1);
    });