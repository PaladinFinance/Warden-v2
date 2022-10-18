export { };
const { ethers } = require("ethers");
import { BigNumber } from "@ethersproject/bignumber";

const WardenABI = require('../abi/Warden.json');
const OldWardenABI = require('../abi/Old_Warden.json');
const veBoostv2ABI = require('../abi/veBoostv2.json');
const IERC20ABI = require('../abi/IERC20.json');

const { WARDEN_ADDRESS, DELEGATION_BOOST_ADDRESS, VOTING_ESCROW_ADDRESS } = require('../utils/main_params');

const OLD_WARDEN_ADDRESS = "0x2e2f6aece0B7Caa7D3BfDFb2728F50b4e211F1eB"

const provider = new ethers.providers.JsonRpcProvider("https://eth-mainnet.alchemyapi.io/v2/" + (process.env.ALCHEMY_API_KEY || ''));

const start_block = 15300315
const end_block = 15673779
const punishement_end_block = 15767145

const old_warden_check_block = 15167600 //when we closed the market

const UNIT = ethers.utils.parseEther('1')

const displayBalance = (num: BigNumber, decimals = 4) => {
    let temp = Number(ethers.utils.formatEther(num)).toFixed(decimals)
    let values = temp.toString().split(".")
    values[0] = values[0].split("").reverse().map((digit, index) =>
        index != 0 && index % 3 === 0 ? `${digit},` : digit
    ).reverse().join("")
    return values.join(".")
}

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

let sum_total_points = BigNumber.from('0')

const total_rewards = ethers.utils.parseEther('50000')



async function main() {

    const Warden = new ethers.Contract(WARDEN_ADDRESS, WardenABI, provider);
    const OldWarden = new ethers.Contract(OLD_WARDEN_ADDRESS, OldWardenABI, provider);

    const Boostv2 = new ethers.Contract(DELEGATION_BOOST_ADDRESS, veBoostv2ABI, provider);

    const veCRV = new ethers.Contract(VOTING_ESCROW_ADDRESS, IERC20ABI, provider);

    const total_blocks = end_block - start_block

    // Get all Boost events from veBoost
    // Get all purchases from Warden
    // ==> No need, only Warden purchase during the period
    /*const boosts = await Boostv2.queryFilter(Boostv2.filters.Boost())
    for(let b of boosts){
        const event_blocknumber = (await b.getBlock()).number
        if(event_blocknumber < start_block) continue;

        console.log(event_blocknumber, ' - ', b)
    }
    console.log()*/ 

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

    for(let r of registers){
        const user_addr = r.args['user'];

        // to avoid any double count of an user
        if(rewarded_users.includes(user_addr)) continue;

        // filter the users that quit already
        const quitted = (await Warden.userIndex(user_addr, { blockTag: end_block })).eq(0)
        if(quitted) continue;

        // create Register struct for each based on current data
        // (consider start date of Registry but current Offer params if was updated ??)
        const event_blocknumber = (await r.getBlock()).number
        let registration: RegisteredUser = {
            percentage: BigNumber.from(0),
            start_block: event_blocknumber,
            expired: false,
            points: BigNumber.from(0),
        }

        // user base 10000 points per veCRV registered in the market
        const end_block_balance = await veCRV.balanceOf(user_addr, { blockTag: end_block })
        const offer_index = await Warden.userIndex(user_addr, { blockTag: end_block })
        const offer_params = await Warden.offers(offer_index, { blockTag: end_block })
        const registered_balance = end_block_balance.mul(offer_params.maxPerc).div(10000)
        registration.points = registration.points.add(registered_balance.mul(10000).div(UNIT))

        // punishement if users balance used in Boost outside of Warden before Registering
        // (not during because no other Boost creating than Warden v2 during the inspected duration)
        const delegating_when_registering = await Boostv2.delegated_balance(user_addr, { blockTag: event_blocknumber })
        const register_block_balance = await veCRV.balanceOf(user_addr, { blockTag: event_blocknumber })
        const register_offer_index = await Warden.userIndex(user_addr, { blockTag: event_blocknumber })
        const registering_balance = register_block_balance.mul((await Warden.offers(register_offer_index, { blockTag: event_blocknumber })).maxPerc).div(10000)
        const blocked_balance = register_block_balance.sub(registering_balance)
        if(delegating_when_registering.gt(blocked_balance)){
            const extra_delegated = delegating_when_registering.sub(blocked_balance)
            const extra_ratio = BigNumber.from(10000).sub(extra_delegated.mul(10000).div(register_block_balance))
            registration.points = registration.points.mul(BigNumber.from(10000).sub(extra_ratio)).div(10000)
        }

        // calculate user ratio based on start block w/ the user Registration block
        // => ratio between user join block compared to start block
        // => reduce the user points the user had based on that ratio
        const present_blocks = BigNumber.from(end_block).sub(event_blocknumber)
        const present_ratio = present_blocks.mul(10000).div(total_blocks)
        registration.points = registration.points.mul(present_ratio).div(10000)

        // apply multiplier on user points if was registered on Old Warden (x1.1)
        if(old_registered_users.includes(user_addr)){
            registration.points = registration.points.add(registration.points.div(10))
        }

        // punishement if not Registered anymore 2 weeks after end of rewards period (slashed 50%)
        const quitted_punishement_block = (await Warden.userIndex(user_addr, { blockTag: punishement_end_block })).eq(0)
        if(quitted_punishement_block) {
            registration.points = registration.points.div(2)
        }

        // save user points + add them to the sum
        user_registrations.set(user_addr, registration)
        sum_total_points = sum_total_points.add(registration.points)
        rewarded_users.push(user_addr)
    }

    const reward_per_point = total_rewards.div(sum_total_points)

    let summed_rewards = BigNumber.from(0)

    // 2nd scoring object, based on total points & user points
    // w/ amount of token to receive based on user points
    for(let u of rewarded_users){
        if(!user_registrations.has(u)) console.log('User no Registration')
        let user_registration: RegisteredUser = user_registrations.get(u) as RegisteredUser

        let expected_rewards = user_registration.points.mul(reward_per_point)

        console.log(u, '- Points:', user_registration.points.toString().padStart(12), '- Rewards:', displayBalance(expected_rewards).padStart(12))

        summed_rewards = summed_rewards.add(expected_rewards)
    }
    console.log(displayBalance(total_rewards))
    console.log(displayBalance(summed_rewards))
    console.log(total_rewards.sub(summed_rewards).toString())

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