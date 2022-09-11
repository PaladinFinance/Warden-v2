const hre = require("hardhat");
import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { Warden } from "../typechain/Warden";
import { IERC20 } from "../typechain/oz/interfaces/IERC20";
import { IERC20__factory } from "../typechain/factories/oz/interfaces/IERC20__factory";
import { IVotingEscrow } from "../typechain/interfaces/IVotingEscrow";
import { IVotingEscrow__factory } from "../typechain/factories/interfaces/IVotingEscrow__factory";
import { IBoostV2 } from "../typechain/interfaces/IBoostV2";
import { IBoostV2__factory } from "../typechain/factories/interfaces/IBoostV2__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractFactory } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";

import {
    advanceTime,
    getERC20,
    resetFork,
} from "./utils/utils";

import { TOKEN_ADDRESS, VOTING_ESCROW_ADDRESS, BOOST_DELEGATION_ADDRESS, BIG_HOLDER, VECRV_LOCKING_TIME } from "./utils/constant"

const WEEK = BigNumber.from(7 * 86400);
const MAX_BPS = BigNumber.from(10000);
const UNIT = ethers.utils.parseEther('1')

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;

const MAX_UINT = ethers.constants.MaxUint256

let wardenFactory: ContractFactory

describe('Warden contract tests', () => {
    let admin: SignerWithAddress
    let reserveManager: SignerWithAddress
    let priceManager: SignerWithAddress
    let delegator: SignerWithAddress
    let receiver: SignerWithAddress
    let externalUser: SignerWithAddress

    let warden: Warden

    let CRV: IERC20
    let veCRV: IVotingEscrow
    let delegationBoost: IBoostV2

    const price_per_vote = BigNumber.from(8.25 * 1e10) // ~ 50CRV for a 1000 veCRV boost for a week

    const base_advised_price = BigNumber.from(1.25 * 1e10)

    before(async () => {
        await resetFork();

        [admin, reserveManager, priceManager, delegator, receiver, externalUser] = await ethers.getSigners();

        wardenFactory = await ethers.getContractFactory("Warden");

        const crv_amount = ethers.utils.parseEther('3000');
        const lock_amount = ethers.utils.parseEther('1000');

        CRV = IERC20__factory.connect(TOKEN_ADDRESS, provider);

        veCRV = IVotingEscrow__factory.connect(VOTING_ESCROW_ADDRESS, provider);

        delegationBoost = IBoostV2__factory.connect(BOOST_DELEGATION_ADDRESS, provider);

        await getERC20(admin, BIG_HOLDER, CRV, delegator.address, crv_amount);

        await CRV.connect(delegator).approve(veCRV.address, crv_amount);
        const locked_balance = (await veCRV.locked(delegator.address)).amount
        const lock_time = VECRV_LOCKING_TIME.add((await ethers.provider.getBlock(ethers.provider.blockNumber)).timestamp)
        if(locked_balance.eq(0)){
            await veCRV.connect(delegator).create_lock(lock_amount, lock_time);
        } else if(locked_balance.lt(lock_amount)) {
            await veCRV.connect(delegator).increase_amount(lock_amount.sub(locked_balance));
            await veCRV.connect(delegator).increase_unlock_time(lock_time);
        } else {
            await veCRV.connect(delegator).increase_unlock_time(lock_time);
        }

        await CRV.connect(delegator).transfer(receiver.address, crv_amount.sub(lock_amount));

    })


    beforeEach(async () => {
        
        warden = (await wardenFactory.connect(admin).deploy(
            CRV.address,
            veCRV.address,
            delegationBoost.address,
            500, //5%
            1000, //10%
            base_advised_price
        )) as Warden;
        await warden.deployed();

        await delegationBoost.connect(delegator).approve(warden.address, MAX_UINT);
    });


    it(' should be deployed & have correct parameters', async () => {
        expect(warden.address).to.properAddress

        const warden_feeToken = await warden.feeToken();
        const warden_votingEscrow = await warden.votingEscrow();
        const warden_delegationBoost = await warden.delegationBoost();
        const warden_feeReserveRatio = await warden.feeReserveRatio();
        const warden_minPercRequired = await warden.minPercRequired();
        const warden_reserveAmount = await warden.reserveAmount();
        const warden_reserveManager = await warden.reserveManager();

        expect(warden_feeToken).to.be.eq(CRV.address);
        expect(warden_votingEscrow).to.be.eq(veCRV.address);
        expect(warden_delegationBoost).to.be.eq(delegationBoost.address);
        expect(warden_feeReserveRatio).to.be.eq(500);
        expect(warden_minPercRequired).to.be.eq(1000);
        expect(warden_reserveAmount).to.be.eq(0);
        expect(warden_reserveManager).to.be.eq(ethers.constants.AddressZero);

        // Since constructor created an ampty BoostOffer at index 0
        // to use index 0 as unregistered users in the userIndex mapping
        const warden_offersIndex = await warden.offersIndex();
        const warden_offers_0 = await warden.offers(0);

        expect(warden_offersIndex).to.be.eq(1);

        expect(warden_offers_0.user).to.be.eq(ethers.constants.AddressZero);
        expect(warden_offers_0.pricePerVote).to.be.eq(0);
        expect(warden_offers_0.minPerc).to.be.eq(0);
        expect(warden_offers_0.maxPerc).to.be.eq(0);

        expect(await warden.advisedPrice()).to.be.eq(base_advised_price);

    });


    describe('register', async () => {

        const min_perc = 2000
        const max_perc = 10000

        const max_duration = 10

        const low_max_perc = 1500

        const incorrect_min_perc = 500
        const incorrect_max_perc = 10100

        let expiry_time: BigNumber

        beforeEach(async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            expiry_time = current_time.add(WEEK.mul(max_duration + 3))

        })

        it(' should register the delegator and add to the listing', async () => {

            const old_offersIndex = await warden.offersIndex();

            const register_tx = await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

            await expect(register_tx)
                .to.emit(warden, 'Registred')
                .withArgs(delegator.address, price_per_vote);

            const new_offersIndex = await warden.offersIndex();

            const delegator_index = await warden.userIndex(delegator.address);

            const delegator_offer = await warden.offers(delegator_index);
            const delegator_offer_data = await warden.getOffer(delegator_index);

            expect(new_offersIndex).to.be.eq(old_offersIndex.add(1));

            expect(delegator_index).not.to.be.eq(0);

            expect(delegator_offer.user).to.be.eq(delegator.address);
            expect(delegator_offer.pricePerVote).to.be.eq(price_per_vote);
            expect(delegator_offer.maxDuration).to.be.eq(max_duration);
            expect(delegator_offer.expiryTime).to.be.eq(expiry_time);
            expect(delegator_offer.minPerc).to.be.eq(min_perc);
            expect(delegator_offer.maxPerc).to.be.eq(max_perc);

            expect(delegator_offer_data.user).to.be.eq(delegator.address);
            expect(delegator_offer_data.pricePerVote).to.be.eq(price_per_vote);
            expect(delegator_offer_data.maxDuration).to.be.eq(max_duration);
            expect(delegator_offer_data.expiryTime).to.be.eq(expiry_time);
            expect(delegator_offer_data.minPerc).to.be.eq(min_perc);
            expect(delegator_offer_data.maxPerc).to.be.eq(max_perc);

        });

        it(' should register and use the advised price', async () => {

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, true);

            const delegator_index = await warden.userIndex(delegator.address);
            const delegator_offer_data = await warden.getOffer(delegator_index);

            expect(delegator_offer_data.pricePerVote).to.be.eq(base_advised_price);

        });

        it(' should set the expiry time as Lock end if given 0', async () => {

            await warden.connect(delegator).register(price_per_vote, max_duration, 0, min_perc, max_perc, true);

            const delegator_index = await warden.userIndex(delegator.address);
            const delegator_offer_data = await warden.getOffer(delegator_index);

            expect(delegator_offer_data.expiryTime).to.be.eq(
                await veCRV.locked__end(delegator.address)
            );

        });

        it(' should fail if the expiry time is incorrect', async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            const wrong_expiry_time = current_time.add(WEEK.div(2))

            await expect(
                warden.connect(delegator).register(price_per_vote, max_duration, wrong_expiry_time, min_perc, max_perc, true)
            ).to.be.revertedWith('IncorrectExpiry')
        });

        it(' should fail if parameters are invalid', async () => {

            await expect(
                warden.connect(delegator).register(0, max_duration, expiry_time, min_perc, max_perc, false)
            ).to.be.revertedWith('NullPrice')

            await expect(
                warden.connect(delegator).register(price_per_vote, expiry_time, max_duration, min_perc, low_max_perc, false)
            ).to.be.revertedWith('MinPercOverMaxPerc')

            await expect(
                warden.connect(delegator).register(price_per_vote, 0, expiry_time, min_perc, max_perc, false)
            ).to.be.revertedWith('NullMaxDuration')

            await expect(
                warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, incorrect_max_perc, false)
            ).to.be.revertedWith('MaxPercTooHigh')

            await expect(
                warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, incorrect_min_perc, max_perc, false)
            ).to.be.revertedWith('MinPercTooLow')

        });

        it(' should fail if warden is not operator for the delegator', async () => {

            await delegationBoost.connect(delegator).approve(warden.address, 0);

            await expect(
                warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false)
            ).to.be.revertedWith('WardenNotOperator')

            await delegationBoost.connect(delegator).approve(warden.address, 500000);

            await expect(
                warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false)
            ).to.be.revertedWith('WardenNotOperator')

        });

        it(' should fail if delegator is already registered', async () => {

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false)

            await expect(
                warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false)
            ).to.be.revertedWith('AlreadyRegistered')

        });

    });


    describe('updateOffer', async () => {

        const min_perc = 2000
        const max_perc = 10000

        const max_duration = 10

        const new_min_perc = 1500
        const new_max_perc = 8000

        const new_max_duration = 8

        const new_price_per_vote = price_per_vote.div(2)

        const low_max_perc = 1000

        const incorrect_min_perc = 500
        const incorrect_max_perc = 10100

        let expiry_time: BigNumber
        let new_expiry_time: BigNumber
        let incorrect_expiry_time: BigNumber

        beforeEach(async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            expiry_time = current_time.add(WEEK.mul(max_duration + 3))
            new_expiry_time = current_time.add(WEEK.mul(new_max_duration + 5))
            incorrect_expiry_time = current_time.add(WEEK.div(2))

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

        });

        it(' should update the delegator BoostOffer correctly', async () => {

            const update_tx = await warden.connect(delegator).updateOffer(new_price_per_vote, new_max_duration, new_expiry_time, new_min_perc, new_max_perc, false)

            await expect(update_tx)
                .to.emit(warden, 'UpdateOffer')
                .withArgs(delegator.address, new_price_per_vote);

            const delegator_index = await warden.userIndex(delegator.address);

            const delegator_offer = await warden.offers(delegator_index);
            const delegator_offer_data = await warden.getOffer(delegator_index);

            expect(delegator_index).not.to.be.eq(0);

            expect(delegator_offer.user).to.be.eq(delegator.address);
            expect(delegator_offer.pricePerVote).to.be.eq(new_price_per_vote);
            expect(delegator_offer.maxDuration).to.be.eq(new_max_duration);
            expect(delegator_offer.expiryTime).to.be.eq(new_expiry_time);
            expect(delegator_offer.minPerc).to.be.eq(new_min_perc);
            expect(delegator_offer.maxPerc).to.be.eq(new_max_perc);

            expect(delegator_offer_data.user).to.be.eq(delegator.address);
            expect(delegator_offer_data.pricePerVote).to.be.eq(new_price_per_vote);
            expect(delegator_offer_data.maxDuration).to.be.eq(new_max_duration);
            expect(delegator_offer_data.expiryTime).to.be.eq(new_expiry_time);
            expect(delegator_offer_data.minPerc).to.be.eq(new_min_perc);
            expect(delegator_offer_data.maxPerc).to.be.eq(new_max_perc);

        });

        it(' should update and use the advised price', async () => {

            await warden.connect(delegator).updateOffer(new_price_per_vote, new_max_duration, new_expiry_time, new_min_perc, new_max_perc, true)

            const delegator_index = await warden.userIndex(delegator.address);
            const delegator_offer_data = await warden.getOffer(delegator_index);

            expect(delegator_offer_data.pricePerVote).to.be.eq(base_advised_price);

        });

        it(' should update and use the lock end as expiry time', async () => {

            await warden.connect(delegator).updateOffer(new_price_per_vote, new_max_duration, 0, new_min_perc, new_max_perc, true)

            const delegator_index = await warden.userIndex(delegator.address);
            const delegator_offer_data = await warden.getOffer(delegator_index);

            expect(delegator_offer_data.expiryTime).to.be.eq(
                await veCRV.locked__end(delegator.address)
            );

        });

        it(' should fail if parameters are invalid', async () => {

            await expect(
                warden.connect(delegator).updateOffer(0, max_duration, new_expiry_time, new_min_perc, new_max_perc, false)
            ).to.be.revertedWith('NullPrice')

            await expect(
                warden.connect(delegator).updateOffer(price_per_vote, 0, new_expiry_time, new_min_perc, new_max_perc, false)
            ).to.be.revertedWith('NullMaxDuration')

            await expect(
                warden.connect(delegator).updateOffer(price_per_vote, max_duration, new_expiry_time, new_min_perc, low_max_perc, false)
            ).to.be.revertedWith('MinPercOverMaxPerc')

            await expect(
                warden.connect(delegator).updateOffer(price_per_vote, max_duration, new_expiry_time, new_min_perc, incorrect_max_perc, false)
            ).to.be.revertedWith('MaxPercTooHigh')

            await expect(
                warden.connect(delegator).updateOffer(price_per_vote, max_duration, new_expiry_time, incorrect_min_perc, new_max_perc, false)
            ).to.be.revertedWith('MinPercTooLow')

            await expect(
                warden.connect(delegator).updateOffer(price_per_vote, max_duration, incorrect_expiry_time, new_min_perc, new_max_perc, false)
            ).to.be.revertedWith('IncorrectExpiry')

        });

        it(' should fail if user is not registered yet', async () => {

            await expect(
                warden.connect(externalUser).updateOffer(new_price_per_vote, max_duration, new_expiry_time, new_min_perc, new_max_perc, false)
            ).to.be.revertedWith('NotRegistered')

        });

    });


    describe('updateOfferPrice', async () => {

        const min_perc = 2000
        const max_perc = 10000

        const max_duration = 10

        const new_price_per_vote = price_per_vote.div(2)

        let expiry_time: BigNumber

        beforeEach(async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            expiry_time = current_time.add(WEEK.mul(max_duration + 3))

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

        });

        it(' should update the delegator BoostOffer price correctly', async () => {

            const update_tx = await warden.connect(delegator).updateOfferPrice(new_price_per_vote,  false)

            await expect(update_tx)
                .to.emit(warden, 'UpdateOfferPrice')
                .withArgs(delegator.address, new_price_per_vote);

            const delegator_index = await warden.userIndex(delegator.address);

            const delegator_offer = await warden.offers(delegator_index);
            const delegator_offer_data = await warden.getOffer(delegator_index);

            expect(delegator_index).not.to.be.eq(0);

            expect(delegator_offer.user).to.be.eq(delegator.address);
            expect(delegator_offer.pricePerVote).to.be.eq(new_price_per_vote);

            expect(delegator_offer_data.user).to.be.eq(delegator.address);
            expect(delegator_offer_data.pricePerVote).to.be.eq(new_price_per_vote);

        });

        it(' should update and use the advised price', async () => {

            const update_tx = await warden.connect(delegator).updateOfferPrice(new_price_per_vote, true)

            await expect(update_tx)
                .to.emit(warden, 'UpdateOfferPrice')
                .withArgs(delegator.address, base_advised_price);

            const delegator_index = await warden.userIndex(delegator.address);
            const delegator_offer_data = await warden.getOffer(delegator_index);

            expect(delegator_offer_data.pricePerVote).to.be.eq(base_advised_price);

        });

        it(' should fail if parameters are invalid', async () => {

            await expect(
                warden.connect(delegator).updateOfferPrice(0, false)
            ).to.be.revertedWith('NullPrice')

        });

        it(' should fail if user is not registered yet', async () => {

            await expect(
                warden.connect(externalUser).updateOfferPrice(new_price_per_vote, false)
            ).to.be.revertedWith('NotRegistered')

        });

    });


    describe('quit', async () => {

        const min_perc = 2000
        const max_perc = 10000

        const max_duration = 10

        let expiry_time: BigNumber

        beforeEach(async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            expiry_time = current_time.add(WEEK.mul(max_duration + 3))

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

        });

        it(' should remove the BoostOffer and the delegator from the listing', async () => {

            const old_offersIndex = await warden.offersIndex();

            const quit_tx = await warden.connect(delegator).quit()

            await expect(quit_tx)
                .to.emit(warden, 'Quit')
                .withArgs(delegator.address);

            const new_offersIndex = await warden.offersIndex();

            const delegator_index = await warden.userIndex(delegator.address);

            const delegator_offer = await warden.getOffer(delegator_index);

            expect(new_offersIndex).to.be.eq(old_offersIndex.sub(1));

            expect(delegator_index).to.be.eq(0);

            expect(delegator_offer.user).to.be.eq(ethers.constants.AddressZero);
            expect(delegator_offer.pricePerVote).to.be.eq(0);
            expect(delegator_offer.minPerc).to.be.eq(0);
            expect(delegator_offer.maxPerc).to.be.eq(0);

        });

        it(' should change other users Boost index if was not last of the list', async () => {

            await delegationBoost.connect(externalUser).approve(warden.address, MAX_UINT);
            await warden.connect(externalUser).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

            const old_delegator_index = await warden.userIndex(delegator.address);
            const old_externalUser_index = await warden.userIndex(externalUser.address);
            const externalUser_offer_before = await warden.getOffer(old_externalUser_index);

            await warden.connect(delegator).quit()

            const new_externalUser_index = await warden.userIndex(externalUser.address);
            const externalUser_offer_after = await warden.offers(new_externalUser_index);

            expect(new_externalUser_index).not.to.be.eq(old_externalUser_index);
            expect(new_externalUser_index).to.be.eq(old_delegator_index);

            expect(externalUser_offer_after.user).to.be.eq(externalUser.address);

            expect(externalUser_offer_before.user).to.be.eq(externalUser_offer_after.user);
            expect(externalUser_offer_before.pricePerVote).to.be.eq(externalUser_offer_after.pricePerVote);
            expect(externalUser_offer_before.minPerc).to.be.eq(externalUser_offer_after.minPerc);
            expect(externalUser_offer_before.maxPerc).to.be.eq(externalUser_offer_after.maxPerc);

        });

        it(' should claim remaining earnedFees', async () => {

            const fee_amount = ethers.utils.parseEther('100');

            await CRV.connect(receiver).approve(warden.address, fee_amount)
            await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, 10000, 1, fee_amount);

            const earned_fees = await warden.earnedFees(delegator.address)

            const old_delegator_balance = await CRV.balanceOf(delegator.address)

            await warden.connect(delegator).quit()

            const new_delegator_balance = await CRV.balanceOf(delegator.address)

            expect(new_delegator_balance.sub(old_delegator_balance)).to.be.eq(earned_fees)

            await advanceTime(WEEK.mul(2).toNumber())

        });

        it(' should fail if user is not registered', async () => {

            await expect(
                warden.connect(externalUser).quit()
            ).to.be.revertedWith('NotRegistered')

        });

    });


    describe('estimateFees', async () => {

        const min_perc = 2000
        const max_perc = 10000

        const max_duration = 10

        const wanted_amount = ethers.utils.parseEther("300")
        const wanted_duration = 1 //weeks


        const over_max_duration = 15
        const incorrect_duration = 0 //weeks

        let expiry_time: BigNumber

        beforeEach(async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            expiry_time = current_time.add(WEEK.mul(max_duration + 3))

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

        });

        it(' should return a correct estimated price', async () => {

            const last_block = (await ethers.provider.getBlockNumber())

            const estimated_amount = await warden.connect(receiver).estimateFees(
                delegator.address,
                wanted_amount,
                wanted_duration,
                { blockTag: last_block }
            )

            const timestamp = (await ethers.provider.getBlock(last_block)).timestamp

            let expected_expiry = BigNumber.from(timestamp).add(WEEK.mul(wanted_duration)).div(WEEK).mul(WEEK)
            expected_expiry = expected_expiry.lt(
                BigNumber.from(expected_expiry).add(WEEK.mul(wanted_duration))
            ) ? expected_expiry.add(WEEK).div(WEEK).mul(WEEK) : expected_expiry

            const expected_value = wanted_amount.mul(price_per_vote).mul(expected_expiry.sub(timestamp)).div(UNIT)

            expect(estimated_amount).to.be.eq(expected_value)

        });

        it(' should return an estimated price using the advised price', async () => {

            await warden.connect(delegator).updateOfferPrice(price_per_vote, true);

            const last_block = (await ethers.provider.getBlockNumber())

            const estimated_amount = await warden.connect(receiver).estimateFees(
                delegator.address,
                wanted_amount,
                wanted_duration,
                { blockTag: last_block }
            )
            
            const timestamp = (await ethers.provider.getBlock(last_block)).timestamp

            let expected_expiry = BigNumber.from(timestamp).add(WEEK.mul(wanted_duration)).div(WEEK).mul(WEEK)
            expected_expiry = expected_expiry.lt(
                BigNumber.from(expected_expiry).add(WEEK.mul(wanted_duration))
            ) ? expected_expiry.add(WEEK).div(WEEK).mul(WEEK) : expected_expiry

            const expected_value = wanted_amount.mul(base_advised_price).mul(expected_expiry.sub(timestamp)).div(UNIT)

            expect(estimated_amount).to.be.eq(expected_value)

        });

        it(' should fail if given incorrect parameters', async () => {
            const under_required_min_perc_amount = (await veCRV.balanceOf(delegator.address)).mul(500).div(MAX_BPS)
            const overflow_max_perc_amount = (await veCRV.balanceOf(delegator.address)).mul(10100).div(MAX_BPS)

            await expect(
                warden.connect(receiver).estimateFees(ethers.constants.AddressZero, wanted_amount, wanted_duration)
            ).to.be.revertedWith('ZeroAddress')

            await expect(
                warden.connect(receiver).estimateFees(externalUser.address, wanted_amount, wanted_duration)
            ).to.be.revertedWith('NotRegistered')

            await expect(
                warden.connect(receiver).estimateFees(delegator.address, wanted_amount, over_max_duration)
            ).to.be.revertedWith('DurationOverOfferMaxDuration')

            await expect(
                warden.connect(receiver).estimateFees(delegator.address, under_required_min_perc_amount, wanted_duration)
            ).to.be.revertedWith('PercentUnderMinRequired')

            await expect(
                warden.connect(receiver).estimateFees(delegator.address, overflow_max_perc_amount, wanted_duration)
            ).to.be.revertedWith('PercentOverMax')

            await expect(
                warden.connect(receiver).estimateFees(delegator.address, wanted_amount, incorrect_duration)
            ).to.be.revertedWith('DurationTooShort')

        });

        it(' should fail if parameters do not match delegator Offer', async () => {
            const incorrect_min_perc_amount = (await veCRV.balanceOf(delegator.address)).mul(1500).div(MAX_BPS)
            const incorrect_max_perc_amount = (await veCRV.balanceOf(delegator.address)).mul(8000).div(MAX_BPS)

            await warden.connect(delegator).updateOffer(price_per_vote, max_duration, expiry_time, min_perc, 7500, false)

            await expect(
                warden.connect(receiver).estimateFees(delegator.address, incorrect_min_perc_amount, wanted_duration)
            ).to.be.revertedWith('PercentOutOfferBonds')

            await expect(
                warden.connect(receiver).estimateFees(delegator.address, incorrect_max_perc_amount, wanted_duration)
            ).to.be.revertedWith('PercentOutOfferBonds')

        });

        it(' should fail if Offer is expired', async () => {

            await advanceTime((WEEK.mul(max_duration + 4)).toNumber())

            await expect(
                warden.connect(receiver).estimateFees(delegator.address, wanted_amount, wanted_duration)
            ).to.be.revertedWith('OfferExpired')

        });

    });


    describe('estimateFeesPercent', async () => {

        const min_perc = 2000
        const max_perc = 10000

        const max_duration = 10

        const wanted_perc = 5000
        const wanted_duration = 1 //weeks

        const over_max_duration = 15
        const incorrect_min_perc = 1500
        const incorrect_max_perc = 8000
        const under_required_min_perc = 500
        const overflow_max_perc = 10100
        const incorrect_duration = 0 //weeks

        let expiry_time: BigNumber

        beforeEach(async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            expiry_time = current_time.add(WEEK.mul(max_duration + 3))

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

        });

        it(' should return an estimated price', async () => {

            const last_block = (await ethers.provider.getBlockNumber())

            const estimated_amount = await warden.connect(receiver).estimateFeesPercent(
                delegator.address,
                wanted_perc,
                wanted_duration,
                { blockTag: last_block }
            )

            const block_wanted_amount = (await veCRV.balanceOf(delegator.address, { blockTag: last_block })).mul(wanted_perc).div(MAX_BPS)

            const timestamp = (await ethers.provider.getBlock(last_block)).timestamp

            let expected_expiry = BigNumber.from(timestamp).add(WEEK.mul(wanted_duration)).div(WEEK).mul(WEEK)
            expected_expiry = expected_expiry.lt(
                BigNumber.from(expected_expiry).add(WEEK.mul(wanted_duration))
            ) ? expected_expiry.add(WEEK).div(WEEK).mul(WEEK) : expected_expiry

            const expected_value = block_wanted_amount.mul(price_per_vote).mul(expected_expiry.sub(timestamp)).div(UNIT)

            expect(estimated_amount).to.be.eq(expected_value)

        });

        it(' should return an estimated price using the advised price', async () => {

            await warden.connect(delegator).updateOfferPrice(price_per_vote, true);

            const last_block = (await ethers.provider.getBlockNumber())

            const estimated_amount = await warden.connect(receiver).estimateFeesPercent(
                delegator.address,
                wanted_perc,
                wanted_duration,
                { blockTag: last_block }
            )

            const block_wanted_amount = (await veCRV.balanceOf(delegator.address, { blockTag: last_block })).mul(wanted_perc).div(MAX_BPS)

            const timestamp = (await ethers.provider.getBlock(last_block)).timestamp

            let expected_expiry = BigNumber.from(timestamp).add(WEEK.mul(wanted_duration)).div(WEEK).mul(WEEK)
            expected_expiry = expected_expiry.lt(
                BigNumber.from(expected_expiry).add(WEEK.mul(wanted_duration))
            ) ? expected_expiry.add(WEEK).div(WEEK).mul(WEEK) : expected_expiry

            const expected_value = block_wanted_amount.mul(base_advised_price).mul(expected_expiry.sub(timestamp)).div(UNIT)

            expect(estimated_amount).to.be.eq(expected_value)

        });

        it(' should fail if given incorrect parameters', async () => {

            await expect(
                warden.connect(receiver).estimateFeesPercent(ethers.constants.AddressZero, wanted_perc, wanted_duration)
            ).to.be.revertedWith('ZeroAddress')

            await expect(
                warden.connect(receiver).estimateFeesPercent(externalUser.address, wanted_perc, wanted_duration)
            ).to.be.revertedWith('NotRegistered')

            await expect(
                warden.connect(receiver).estimateFeesPercent(delegator.address, wanted_perc, over_max_duration)
            ).to.be.revertedWith('DurationOverOfferMaxDuration')

            await expect(
                warden.connect(receiver).estimateFeesPercent(delegator.address, under_required_min_perc, wanted_duration)
            ).to.be.revertedWith('PercentUnderMinRequired')

            await expect(
                warden.connect(receiver).estimateFeesPercent(delegator.address, overflow_max_perc, wanted_duration)
            ).to.be.revertedWith('PercentOverMax')

            await expect(
                warden.connect(receiver).estimateFeesPercent(delegator.address, wanted_perc, incorrect_duration)
            ).to.be.revertedWith('DurationTooShort')

        });

        it(' should fail if parameters do not match delegator Offer', async () => {

            await warden.connect(delegator).updateOffer(price_per_vote, max_duration, expiry_time, min_perc, 7500, false)

            await expect(
                warden.connect(receiver).estimateFeesPercent(delegator.address, incorrect_min_perc, wanted_duration)
            ).to.be.revertedWith('PercentOutOfferBonds')

            await expect(
                warden.connect(receiver).estimateFeesPercent(delegator.address, incorrect_max_perc, wanted_duration)
            ).to.be.revertedWith('PercentOutOfferBonds')

        });

        it(' should fail if Offer is expired', async () => {

            await advanceTime((WEEK.mul(max_duration + 4)).toNumber())

            await expect(
                warden.connect(receiver).estimateFeesPercent(delegator.address, wanted_perc, wanted_duration)
            ).to.be.revertedWith('OfferExpired')

        });

    });


    describe('canDelegate', async () => {

        const min_perc = 2000
        const max_perc = 10000

        const max_duration = 10

        const wanted_amount = ethers.utils.parseEther("300")
        const boost_amount = ethers.utils.parseEther("400")

        let fee_amount: BigNumber;

        let expiry_time: BigNumber

        beforeEach(async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            expiry_time = current_time.add(WEEK.mul(max_duration + 3))

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

            fee_amount = await warden.estimateFees(delegator.address, boost_amount, 1)

            await CRV.connect(receiver).approve(warden.address, ethers.constants.MaxUint256)

        });

        it(' should return true if the amount fits the Offer & the delegators balance', async () => {

            expect(
                await warden.canDelegate(delegator.address, wanted_amount)
            ).to.be.true

        });

        it(' should return true if the amount fits the Offer & the delegators balance - with active boost', async () => {

            await warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, boost_amount, 1, fee_amount)

            expect(
                await warden.canDelegate(delegator.address, wanted_amount)
            ).to.be.true

            await advanceTime(WEEK.mul(2).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should return false if the amount does not fit delegators available balance', async () => {

            expect(
                await warden.canDelegate(delegator.address, ethers.utils.parseEther('1200'))
            ).to.be.false

        });

        it(' should return false if the amount does not fit delegators available balance - with active boost', async () => {

            await warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, boost_amount, 1, fee_amount)

            expect(
                await warden.canDelegate(delegator.address, ethers.utils.parseEther('800'))
            ).to.be.false

            await advanceTime(WEEK.mul(2).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should return false if the amount does not fit the Offer', async () => {

            await warden.connect(delegator).updateOffer(price_per_vote, max_duration, expiry_time, min_perc, 8000, false);

            expect(
                await warden.canDelegate(delegator.address, ethers.utils.parseEther('850'))
            ).to.be.false

        });

        it(' should return false if the amount does not fit the Offer - with active boost', async () => {

            await warden.connect(delegator).updateOffer(price_per_vote, max_duration, expiry_time, min_perc, 8000, false);

            await warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, boost_amount, 1, fee_amount)

            expect(
                await warden.canDelegate(delegator.address, ethers.utils.parseEther('500'))
            ).to.be.false

            await advanceTime(WEEK.mul(2).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should return false if the delegator did not approve Warden', async () => {

            expect(
                await warden.canDelegate(externalUser.address, wanted_amount)
            ).to.be.false

        });

    });


    describe('canDelegatePercent', async () => {

        const min_perc = 2000
        const max_perc = 10000

        const max_duration = 10

        const wanted_percent = 3500
        const boost_percent = 4000

        let fee_amount: BigNumber;

        let expiry_time: BigNumber

        beforeEach(async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            expiry_time = current_time.add(WEEK.mul(max_duration + 3))

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

            fee_amount = await warden.estimateFeesPercent(delegator.address, boost_percent, 1)

            await CRV.connect(receiver).approve(warden.address, ethers.constants.MaxUint256)

        });

        it(' should return true if the amount fits the Offer & the delegators balance', async () => {

            expect(
                await warden.canDelegatePercent(delegator.address, wanted_percent)
            ).to.be.true

            expect(
                await warden.canDelegatePercent(delegator.address, 10000)
            ).to.be.true

        });

        it(' should return true if the amount fits the Offer & the delegators balance - with active boost', async () => {

            await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, boost_percent, 1, fee_amount)

            expect(
                await warden.canDelegatePercent(delegator.address, wanted_percent)
            ).to.be.true

            await advanceTime(WEEK.mul(2).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should return false if the amount does not fit delegators available balance', async () => {

            expect(
                await warden.canDelegatePercent(delegator.address, ethers.utils.parseEther('1200'))
            ).to.be.false

        });

        it(' should return false if the amount does not fit delegators available balance - with active boost', async () => {

            await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, boost_percent, 1, fee_amount)

            expect(
                await warden.canDelegatePercent(delegator.address, ethers.utils.parseEther('800'))
            ).to.be.false

            await advanceTime(WEEK.mul(2).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should return false if the amount does not fit the Offer', async () => {

            await warden.connect(delegator).updateOffer(price_per_vote, max_duration, expiry_time, min_perc, 8000, false);

            expect(
                await warden.canDelegatePercent(delegator.address, ethers.utils.parseEther('850'))
            ).to.be.false

        });

        it(' should return false if the amount does not fit the Offer - with active boost', async () => {

            await warden.connect(delegator).updateOffer(price_per_vote, max_duration, expiry_time, min_perc, 8000, false);

            await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, boost_percent, 1, fee_amount)

            expect(
                await warden.canDelegatePercent(delegator.address, ethers.utils.parseEther('500'))
            ).to.be.false

            await advanceTime(WEEK.mul(2).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should return false if the delegator did not approve Warden', async () => {

            expect(
                await warden.canDelegate(externalUser.address, wanted_percent)
            ).to.be.false

        });

    });


    describe('buyDelegationBoost', async () => {

        const min_perc = 2000
        const max_perc = 10000

        const max_duration = 10

        const buy_amount = ethers.utils.parseEther('450')

        let fee_amount: BigNumber;

        const updated_max_perc = 8000

        const duration = 2
        const wrong_duration = 0
        const over_max_duration = 15

        const one_week = 7 * 86400;

        let expiry_time: BigNumber

        beforeEach(async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            expiry_time = current_time.add(WEEK.mul(max_duration + 3))

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

            fee_amount = await warden.estimateFees(delegator.address, buy_amount, duration)

            await CRV.connect(receiver).approve(warden.address, ethers.constants.MaxUint256)

        });

        it(' should create a Boost from the delegator to the caller', async () => {

            const old_balance = await CRV.balanceOf(receiver.address)

            const buy_tx = await warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, buy_amount, duration, fee_amount)

            const new_balance = await CRV.balanceOf(receiver.address)

            const token_id = (await warden.nextBoostId()).sub(1)

            const tx_timestamp = (await ethers.provider.getBlock((await buy_tx).blockNumber || 0)).timestamp

            let boost_expire_time = BigNumber.from(tx_timestamp).add(WEEK.mul(duration)).div(WEEK).mul(WEEK)
            boost_expire_time = boost_expire_time.lt(
                BigNumber.from(tx_timestamp).add(WEEK.mul(duration))
            ) ? boost_expire_time.add(WEEK).div(WEEK).mul(WEEK) : boost_expire_time

            const paidFees = old_balance.sub(new_balance)

            await expect(buy_tx)
                .to.emit(warden, 'BoostPurchase')
                .withArgs(
                    delegator.address,
                    receiver.address,
                    token_id,
                    buy_amount,
                    price_per_vote,
                    paidFees,
                    boost_expire_time
                );

            expect(paidFees).to.be.lt(fee_amount)

            const tx_block = (await buy_tx).blockNumber

            const veCRV_balance_receiver = await veCRV.balanceOf(receiver.address, { blockTag: tx_block })
            const veCRV_balance_delegator = await veCRV.balanceOf(delegator.address, { blockTag: tx_block })
            const veCRV_adjusted_receiver = await delegationBoost.adjusted_balance_of(receiver.address, { blockTag: tx_block })
            const veCRV_adjusted_delegator = await delegationBoost.adjusted_balance_of(delegator.address, { blockTag: tx_block })

            // Here:
            // Can't use .eq() because of how the slope is calculated inside BoostV2
            // slope: uint256 = _amount / (_endtime - block.timestamp)
            // bias: uint256 = slope * (_endtime - block.timestamp)
            // when calculating back the amount (amount: uint256 = point.slope * (ts - point.ts))
            // we see a small difference due to the division to get the slope
            expect(await delegationBoost.received_balance(receiver.address, { blockTag: tx_block })).to.be.closeTo(buy_amount, 1e8)
            expect(await delegationBoost.delegated_balance(delegator.address, { blockTag: tx_block })).to.be.closeTo(buy_amount, 1e8)

            expect(boost_expire_time).to.be.gte(tx_timestamp + (duration * one_week)) //since there might be "bonus days" because of the veBoost rounding down on expire_time

            expect(veCRV_adjusted_receiver).to.be.closeTo(veCRV_balance_receiver.add(buy_amount), 1e8)
            expect(veCRV_adjusted_delegator).to.be.closeTo(veCRV_balance_delegator.sub(buy_amount), 1e8)

            await advanceTime(WEEK.mul(duration + 1).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should create a Boost using the advised price', async () => {

            await warden.connect(delegator).updateOfferPrice(price_per_vote, true);

            const fee_amount_advisedPrice = await warden.estimateFees(delegator.address, buy_amount, duration)

            const old_balance = await CRV.balanceOf(receiver.address)

            const buy_tx = await warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, buy_amount, duration, fee_amount_advisedPrice)

            const new_balance = await CRV.balanceOf(receiver.address)

            const token_id = (await warden.nextBoostId()).sub(1)

            const tx_timestamp = (await ethers.provider.getBlock((await buy_tx).blockNumber || 0)).timestamp

            let boost_expire_time = BigNumber.from(tx_timestamp).add(WEEK.mul(duration)).div(WEEK).mul(WEEK)
            boost_expire_time = boost_expire_time.lt(
                BigNumber.from(tx_timestamp).add(WEEK.mul(duration))
            ) ? boost_expire_time.add(WEEK).div(WEEK).mul(WEEK) : boost_expire_time

            const paidFees = old_balance.sub(new_balance)

            await expect(buy_tx)
                .to.emit(warden, 'BoostPurchase')
                .withArgs(
                    delegator.address,
                    receiver.address,
                    token_id,
                    buy_amount,
                    base_advised_price,
                    paidFees,
                    boost_expire_time
                );

            expect(paidFees).to.be.lt(fee_amount_advisedPrice)

            const tx_block = (await buy_tx).blockNumber

            expect(await delegationBoost.received_balance(receiver.address, { blockTag: tx_block })).to.be.closeTo(buy_amount, 1e8)
            expect(await delegationBoost.delegated_balance(delegator.address, { blockTag: tx_block })).to.be.closeTo(buy_amount, 1e8)

            expect(boost_expire_time).to.be.gte(tx_timestamp + (duration * one_week)) //since there might be "bonus days" because of the veBoost rounding down on expire_time

            await advanceTime(WEEK.mul(duration + 1).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should fail if given 0x000...000 as parameter', async () => {

            await expect(
                warden.connect(receiver).buyDelegationBoost(ethers.constants.AddressZero, receiver.address, buy_amount, duration, fee_amount)
            ).to.be.revertedWith('ZeroAddress')

            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, ethers.constants.AddressZero, buy_amount, duration, fee_amount)
            ).to.be.revertedWith('ZeroAddress')

        });

        it(' should fail if wanted delegator is not registered', async () => {

            await expect(
                warden.connect(receiver).buyDelegationBoost(externalUser.address, receiver.address, buy_amount, duration, fee_amount)
            ).to.be.revertedWith('NotRegistered')

        });

        it(' should fail if amount is invalid', async () => {

            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, 0, duration, fee_amount)
            ).to.be.revertedWith('NullValue')

            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, 50, duration, fee_amount)
            ).to.be.revertedWith('PercentUnderMinRequired')

            const delegator_balance = await veCRV.balanceOf(delegator.address)
            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, delegator_balance.mul(15).div(10), duration, fee_amount)
            ).to.be.revertedWith('PercentOverMax')

        });

        it(' should fail if asked amount does not match Offer', async () => {

            await warden.connect(delegator).updateOffer(price_per_vote, max_duration, expiry_time, min_perc, updated_max_perc, false);

            const delegator_balance = await veCRV.balanceOf(delegator.address)
            const delegator_min_bound = delegator_balance.mul(min_perc).div(MAX_BPS)
            const delegator_higher_amount = delegator_balance.mul(max_perc).div(MAX_BPS)

            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, delegator_min_bound.div(2), duration, fee_amount)
            ).to.be.revertedWith('PercentOutOfferBonds')

            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, delegator_higher_amount, duration, fee_amount)
            ).to.be.revertedWith('PercentOutOfferBonds')

        });

        it(' should fail if asked duration is over the Offer maximum', async () => {

            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, buy_amount, over_max_duration, fee_amount)
            ).to.be.revertedWith('DurationOverOfferMaxDuration')

        });

        it(' should fail if asked duration is less than minimum required', async () => {

            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, buy_amount, wrong_duration, fee_amount)
            ).to.be.revertedWith('DurationTooShort')

        });

        it(' should fail if allowed fee amount is 0 or does not cover the Boost duration', async () => {

            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, buy_amount, duration, 0)
            ).to.be.revertedWith('NullFees')

            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, buy_amount, duration, fee_amount.div(2))
            ).to.be.revertedWith('FeesTooLow')

        });

        it(' should fail if contract has not enough allowance for the fee token', async () => {

            await CRV.connect(receiver).approve(warden.address, 0)

            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, buy_amount, duration, fee_amount)
            ).to.be.reverted

        });

        it(' should fail if wanted delegator did not approve Warden', async () => {

            await delegationBoost.connect(delegator).approve(warden.address, 0)

            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, buy_amount, duration, fee_amount)
            ).to.be.revertedWith('CannotDelegate')

        });

        it(' should fail is caller cannot pay the fees', async () => {

            await expect(
                warden.connect(externalUser).buyDelegationBoost(delegator.address, receiver.address, buy_amount, duration, fee_amount)
            ).to.be.reverted

        });

        it(' should fail if 1 Boost already bought and 2nd Boost amount is out of delegator Offer', async () => {

            await warden.connect(delegator).updateOffer(price_per_vote, max_duration, expiry_time, min_perc, updated_max_perc, false);

            await warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, buy_amount, duration, fee_amount)

            const boost_2_amount = ethers.utils.parseEther('400')

            await expect(
                warden.connect(externalUser).buyDelegationBoost(delegator.address, receiver.address, boost_2_amount, duration, fee_amount)
            ).to.be.revertedWith('CannotDelegate')

            await advanceTime(WEEK.mul(duration + 1).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should buy a 2nd Boost if the parameters are correct and the delegators Offer allow it', async () => {

            await warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, buy_amount, duration, fee_amount)

            const boost_2_amount = ethers.utils.parseEther('200')

            const old_balance = await CRV.balanceOf(receiver.address)

            const buy_tx = await warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, boost_2_amount, duration, fee_amount)

            const token_id = (await warden.nextBoostId()).sub(1)

            const new_balance = await CRV.balanceOf(receiver.address)

            const tx_timestamp = (await ethers.provider.getBlock((await buy_tx).blockNumber || 0)).timestamp

            let boost_expire_time = BigNumber.from(tx_timestamp).add(WEEK.mul(duration)).div(WEEK).mul(WEEK)
            boost_expire_time = boost_expire_time.lt(
                BigNumber.from(tx_timestamp).add(WEEK.mul(duration))
            ) ? boost_expire_time.add(WEEK).div(WEEK).mul(WEEK) : boost_expire_time

            const paidFees = old_balance.sub(new_balance)

            await expect(buy_tx)
                .to.emit(warden, 'BoostPurchase')
                .withArgs(
                    delegator.address,
                    receiver.address,
                    token_id,
                    boost_2_amount,
                    price_per_vote,
                    paidFees,
                    boost_expire_time
                );

            await advanceTime(WEEK.mul(duration + 2).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should fail if Offer is expired', async () => {

            await advanceTime((WEEK.mul(max_duration + 4)).toNumber())

            await expect(
                warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, buy_amount, duration, fee_amount)
            ).to.be.revertedWith('OfferExpired')

        });

    });


    describe('buyDelegationBoostPercent', async () => {

        const min_perc = 2000
        const max_perc = 10000

        const max_duration = 10

        const buy_percent = 5000

        let fee_amount: BigNumber;

        const updated_max_perc = 8000

        const wrong_min_perc = 1500
        const wrong_max_perc = 9000

        const under_min_required_perc = 500
        const over_max_perc = 10100

        const duration = 2
        const wrong_duration = 0
        const over_max_duration = 15

        const one_week = 7 * 86400;

        let expiry_time: BigNumber

        beforeEach(async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            expiry_time = current_time.add(WEEK.mul(max_duration + 3))

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

            fee_amount = await warden.estimateFeesPercent(delegator.address, buy_percent, duration)

            await CRV.connect(receiver).approve(warden.address, ethers.constants.MaxUint256)

        });


        it(' should create a Boost from the delegator to the caller', async () => {

            const old_balance = await CRV.balanceOf(receiver.address)

            const buy_tx = await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, buy_percent, duration, fee_amount)

            const new_balance = await CRV.balanceOf(receiver.address)

            const token_id = (await warden.nextBoostId()).sub(1)

            const tx_block = (await buy_tx).blockNumber
            const tx_timestamp = (await ethers.provider.getBlock((await buy_tx).blockNumber || 0)).timestamp

            let boost_expire_time = BigNumber.from(tx_timestamp).add(WEEK.mul(duration)).div(WEEK).mul(WEEK)
            boost_expire_time = boost_expire_time.lt(
                BigNumber.from(tx_timestamp).add(WEEK.mul(duration))
            ) ? boost_expire_time.add(WEEK).div(WEEK).mul(WEEK) : boost_expire_time

            const paidFees = old_balance.sub(new_balance)

            const estimated_buy_amount = (await veCRV.balanceOf(delegator.address, { blockTag: tx_block })).mul(buy_percent).div(MAX_BPS)

            await expect(buy_tx)
                .to.emit(warden, 'BoostPurchase')
                .withArgs(
                    delegator.address,
                    receiver.address,
                    token_id,
                    estimated_buy_amount,
                    price_per_vote,
                    paidFees,
                    boost_expire_time
                );

            expect(paidFees).to.be.lt(fee_amount)

            const veCRV_balance_receiver = await veCRV.balanceOf(receiver.address, { blockTag: tx_block })
            const veCRV_balance_delegator = await veCRV.balanceOf(delegator.address, { blockTag: tx_block })
            const veCRV_adjusted_receiver = await delegationBoost.adjusted_balance_of(receiver.address, { blockTag: tx_block })
            const veCRV_adjusted_delegator = await delegationBoost.adjusted_balance_of(delegator.address, { blockTag: tx_block })

            expect(await delegationBoost.received_balance(receiver.address, { blockTag: tx_block })).to.be.closeTo(estimated_buy_amount, 1e8)
            expect(await delegationBoost.delegated_balance(delegator.address, { blockTag: tx_block })).to.be.closeTo(estimated_buy_amount, 1e8)

            expect(boost_expire_time).to.be.gte(tx_timestamp + (duration * one_week)) //since there might be "bonus days" because of the veBoost rounding down on expire_time

            expect(veCRV_adjusted_receiver).to.be.closeTo(veCRV_balance_receiver.add(estimated_buy_amount), 1e8)
            expect(veCRV_adjusted_delegator).to.be.closeTo(veCRV_balance_delegator.sub(estimated_buy_amount), 1e8)

            await advanceTime(WEEK.mul(duration + 1).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should create a Boost using the advised price', async () => {

            await warden.connect(delegator).updateOfferPrice(price_per_vote, true);

            const fee_amount_advisedPrice = await warden.estimateFeesPercent(delegator.address, buy_percent, duration)

            const old_balance = await CRV.balanceOf(receiver.address)

            const buy_tx = await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, buy_percent, duration, fee_amount_advisedPrice)

            const new_balance = await CRV.balanceOf(receiver.address)

            const token_id = (await warden.nextBoostId()).sub(1)

            const tx_block = (await buy_tx).blockNumber
            const tx_timestamp = (await ethers.provider.getBlock((await buy_tx).blockNumber || 0)).timestamp

            let boost_expire_time = BigNumber.from(tx_timestamp).add(WEEK.mul(duration)).div(WEEK).mul(WEEK)
            boost_expire_time = boost_expire_time.lt(
                BigNumber.from(tx_timestamp).add(WEEK.mul(duration))
            ) ? boost_expire_time.add(WEEK).div(WEEK).mul(WEEK) : boost_expire_time

            const paidFees = old_balance.sub(new_balance)

            const estimated_buy_amount = (await veCRV.balanceOf(delegator.address, { blockTag: tx_block })).mul(buy_percent).div(MAX_BPS)

            await expect(buy_tx)
                .to.emit(warden, 'BoostPurchase')
                .withArgs(
                    delegator.address,
                    receiver.address,
                    token_id,
                    estimated_buy_amount,
                    base_advised_price,
                    paidFees,
                    boost_expire_time
                );

            expect(paidFees).to.be.lt(fee_amount_advisedPrice)

            expect(await delegationBoost.received_balance(receiver.address, { blockTag: tx_block })).to.be.closeTo(estimated_buy_amount, 1e8)
            expect(await delegationBoost.delegated_balance(delegator.address, { blockTag: tx_block })).to.be.closeTo(estimated_buy_amount, 1e8)

            expect(boost_expire_time).to.be.gte(tx_timestamp + (duration * one_week)) //since there might be "bonus days" because of the veBoost rounding down on expire_time

            await advanceTime(WEEK.mul(duration + 1).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should fail if given 0x000...000 as parameter', async () => {

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(ethers.constants.AddressZero, receiver.address, buy_percent, duration, fee_amount)
            ).to.be.revertedWith('ZeroAddress')

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(delegator.address, ethers.constants.AddressZero, buy_percent, duration, fee_amount)
            ).to.be.revertedWith('ZeroAddress')

        });

        it(' should fail if wanted delegator is not registered', async () => {

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(externalUser.address, receiver.address, buy_percent, duration, fee_amount)
            ).to.be.revertedWith('NotRegistered')

        });

        it(' should fail if amount is invalid', async () => {

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, under_min_required_perc, duration, fee_amount)
            ).to.be.revertedWith('PercentUnderMinRequired')

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, over_max_perc, duration, fee_amount)
            ).to.be.revertedWith('PercentOverMax')

        });

        it(' should fail if asked amount does not match Offer', async () => {

            await warden.connect(delegator).updateOffer(price_per_vote, max_duration, expiry_time, min_perc, updated_max_perc, false);

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, wrong_min_perc, duration, fee_amount)
            ).to.be.revertedWith('PercentOutOfferBonds')

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, wrong_max_perc, duration, fee_amount)
            ).to.be.revertedWith('PercentOutOfferBonds')

        });

        it(' should fail if asked duration is over the Offer maximum', async () => {

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, buy_percent, over_max_duration, fee_amount)
            ).to.be.revertedWith('DurationOverOfferMaxDuration')

        });

        it(' should fail if asked duration is less than minimum required', async () => {

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, buy_percent, wrong_duration, fee_amount)
            ).to.be.revertedWith('DurationTooShort')

        });

        it(' should fail if allowed fee amount is 0 or does not cover the Boost duration', async () => {

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, buy_percent, duration, 0)
            ).to.be.revertedWith('NullFees')

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, buy_percent, duration, fee_amount.div(2))
            ).to.be.revertedWith('FeesTooLow')

        });

        it(' should fail if contract has not enough allowance for the fee token', async () => {

            await CRV.connect(receiver).approve(warden.address, 0)

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, buy_percent, duration, fee_amount)
            ).to.be.reverted

        });

        it(' should fail if wanted delegator did not approve Warden', async () => {

            await delegationBoost.connect(delegator).approve(warden.address, 0)

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, buy_percent, duration, fee_amount)
            ).to.be.revertedWith('CannotDelegate')

        });

        it(' should fail is caller cannot pay the fees', async () => {

            await expect(
                warden.connect(externalUser).buyDelegationBoostPercent(delegator.address, receiver.address, buy_percent, duration, fee_amount)
            ).to.be.reverted

        });

        it(' should fail if 1 Boost already bought and 2nd Boost amount is out of delegator Offer', async () => {

            await warden.connect(delegator).updateOffer(price_per_vote, max_duration, expiry_time, min_perc, updated_max_perc, false);

            await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, buy_percent, duration, fee_amount)

            const boost_2_percent = 4000

            await expect(
                warden.connect(externalUser).buyDelegationBoostPercent(delegator.address, receiver.address, boost_2_percent, duration, fee_amount)
            ).to.be.revertedWith('CannotDelegate')

            await advanceTime(WEEK.mul(duration + 1).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should buy a 2nd Boost if the parameters are correct and the delegators Offer allow it', async () => {

            await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, buy_percent, duration, fee_amount)

            const boost_2_percent = 2500

            const old_balance = await CRV.balanceOf(receiver.address)

            const buy_tx = await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, boost_2_percent, duration, fee_amount)

            const token_id = (await warden.nextBoostId()).sub(1)

            const new_balance = await CRV.balanceOf(receiver.address)

            const tx_block = (await buy_tx).blockNumber
            const tx_timestamp = (await ethers.provider.getBlock((await buy_tx).blockNumber || 0)).timestamp

            let boost_expire_time = BigNumber.from(tx_timestamp).add(WEEK.mul(duration)).div(WEEK).mul(WEEK)
            boost_expire_time = boost_expire_time.lt(
                BigNumber.from(tx_timestamp).add(WEEK.mul(duration))
            ) ? boost_expire_time.add(WEEK).div(WEEK).mul(WEEK) : boost_expire_time

            const paidFees = old_balance.sub(new_balance)

            const estimated_buy_amount = (await veCRV.balanceOf(delegator.address, { blockTag: tx_block })).mul(boost_2_percent).div(MAX_BPS)

            await expect(buy_tx)
                .to.emit(warden, 'BoostPurchase')
                .withArgs(
                    delegator.address,
                    receiver.address,
                    token_id,
                    estimated_buy_amount,
                    price_per_vote,
                    paidFees,
                    boost_expire_time
                );

            await advanceTime(WEEK.mul(duration + 2).toNumber())
            await delegationBoost.connect(delegator).checkpoint_user(delegator.address)

        });

        it(' should fail if Offer is expired', async () => {

            await advanceTime((WEEK.mul(max_duration + 4)).toNumber())

            await expect(
                warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, buy_percent, duration, fee_amount)
            ).to.be.revertedWith('OfferExpired')

        });

    });


    describe('claim', async () => {

        const min_perc = 2000
        const max_perc = 10000

        const max_duration = 10

        let expiry_time: BigNumber

        beforeEach(async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            expiry_time = current_time.add(WEEK.mul(max_duration + 3))

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

            const fee_amount = ethers.utils.parseEther('100');

            await CRV.connect(receiver).approve(warden.address, fee_amount)
            await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, 10000, 1, fee_amount);

            await advanceTime(WEEK.mul(2).toNumber())

        });

        it(' should claim earned amount and update delegators claimable amount', async () => {

            const earned = await warden.claimable(delegator.address)

            const old_Balance = await CRV.balanceOf(delegator.address)

            await expect(warden.connect(delegator).claim())
                .to.emit(warden, 'Claim')
                .withArgs(delegator.address, earned);

            const new_Balance = await CRV.balanceOf(delegator.address)

            expect(new_Balance.sub(old_Balance)).to.be.eq(earned)
            expect(await warden.claimable(delegator.address)).to.be.eq(0)

        });

        it(' should not allow to claim 0 amount', async () => {

            await expect(
                warden.connect(externalUser).claim()
            ).to.be.revertedWith('NullClaimAmount')

        });

        it(' should not allow to claim more than earned', async () => {

            const earned = await warden.claimable(delegator.address)

        });

    });


    describe('setAdvisedPrice', async () => {

        const min_perc = 2000
        const max_perc = 10000

        const max_duration = 10

        const new_base_price = BigNumber.from(2.5 * 1e10)

        let expiry_time: BigNumber

        beforeEach(async () => {

            const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)

            expiry_time = current_time.add(WEEK.mul(max_duration + 3))

            await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

            await warden.connect(admin).approveManager(priceManager.address)

        });

        it(' should update the advised price correctly (& emit the correct Event)', async () => {

            const update_tx = await warden.connect(priceManager).setAdvisedPrice(new_base_price)

            await expect(update_tx)
                .to.emit(warden, 'NewAdvisedPrice')
                .withArgs(new_base_price);

            expect(await warden.advisedPrice()).to.be.eq(new_base_price)

        });

        it(' should update the advised price used by users', async () => {

            await warden.connect(delegator).updateOfferPrice(price_per_vote, true);

            await warden.connect(priceManager).setAdvisedPrice(new_base_price)

            const delegator_offer_data = await warden.getOffer(await warden.userIndex(delegator.address));

            expect(delegator_offer_data.pricePerVote).to.be.eq(new_base_price);

        });

        it(' should use the new basePrice for Offers with default price', async () => {

            const buy_amount = ethers.utils.parseEther('450')

            const duration = 2

            await warden.connect(delegator).updateOfferPrice(price_per_vote, true);

            await warden.connect(priceManager).setAdvisedPrice(new_base_price)

            const fee_amount_advisedPrice = await warden.estimateFees(delegator.address, buy_amount, duration)

            await CRV.connect(receiver).approve(warden.address, ethers.constants.MaxUint256)

            const old_balance = await CRV.balanceOf(receiver.address)

            const buy_tx = await warden.connect(receiver).buyDelegationBoost(delegator.address, receiver.address, buy_amount, duration, fee_amount_advisedPrice)

            const new_balance = await CRV.balanceOf(receiver.address)

            const token_id = (await warden.nextBoostId()).sub(1)

            const tx_timestamp = (await ethers.provider.getBlock((await buy_tx).blockNumber || 0)).timestamp
            let boost_expire_time = BigNumber.from(tx_timestamp).add(WEEK.mul(duration)).div(WEEK).mul(WEEK)
            boost_expire_time = boost_expire_time.lt(
                BigNumber.from(tx_timestamp).add(WEEK.mul(duration))
            ) ? boost_expire_time.add(WEEK).div(WEEK).mul(WEEK) : boost_expire_time

            const paidFees = old_balance.sub(new_balance)

            await expect(buy_tx)
                .to.emit(warden, 'BoostPurchase')
                .withArgs(
                    delegator.address,
                    receiver.address,
                    token_id,
                    buy_amount,
                    new_base_price,
                    paidFees,
                    boost_expire_time
                );

            expect(paidFees).to.be.lt(fee_amount_advisedPrice)

            await advanceTime(WEEK.mul(duration + 1).toNumber())

        });

        it(' should fail if given price 0', async () => {

            await expect(
                warden.connect(priceManager).setAdvisedPrice(0)
            ).to.be.revertedWith('NullValue')

        });

        it(' should only be callable by allowed managers', async () => {

            await expect(
                warden.connect(delegator).setAdvisedPrice(new_base_price)
            ).to.be.revertedWith('CallerNotManager')
    
            await expect(
                warden.connect(externalUser).setAdvisedPrice(new_base_price)
            ).to.be.revertedWith('CallerNotManager')

        });

    })


    describe('Admin functions', async () => {

        describe('pause', async () => {

            it(' should allow admin to pause the contract', async () => {

                await warden.connect(admin).pause();

                await expect(
                    warden.connect(delegator).register(price_per_vote, 10, 0, 2000, 10000, false)
                ).to.be.reverted

            });

            it(' should block non-admin caller', async () => {

                await expect(
                    warden.connect(externalUser).pause()
                ).to.be.reverted

            });

        });

        describe('unpause', async () => {

            it(' should allow the admin to unpause the contract', async () => {

                await warden.connect(admin).pause();

                await warden.connect(admin).unpause();

                await expect(
                    warden.connect(delegator).register(price_per_vote, 10, 0, 2000, 10000, false)
                ).not.to.be.reverted

            });

            it(' should block non-admin caller', async () => {

                await expect(
                    warden.connect(externalUser).unpause()
                ).to.be.reverted

            });

        });

        describe('approveManager', async () => {

            it(' should allow the added address as manager', async () => {
    
                await expect(
                    warden.connect(priceManager).setAdvisedPrice(50)
                ).to.be.revertedWith('CallerNotManager')
    
                await warden.connect(admin).approveManager(priceManager.address)
    
                await expect(
                    warden.connect(priceManager).setAdvisedPrice(50)
                ).to.not.be.reverted
    
            });
    
            it(' should only be allowed for admin', async () => {
    
                await expect(
                    warden.connect(priceManager).approveManager(priceManager.address)
                ).to.be.revertedWith('Ownable: caller is not the owner')
    
                await expect(
                    warden.connect(reserveManager).approveManager(reserveManager.address)
                ).to.be.revertedWith('Ownable: caller is not the owner')
    
            });
    
        });
    
        describe('removeManager', async () => {
    
            beforeEach(async () => {
    
                await warden.connect(admin).approveManager(priceManager.address)
                await warden.connect(admin).approveManager(externalUser.address)
    
            });
    
            it(' should remove the address as manager', async () => {
    
                await expect(
                    warden.connect(priceManager).setAdvisedPrice(50)
                ).to.not.be.reverted
    
                await warden.connect(admin).removeManager(priceManager.address)
    
                await expect(
                    warden.connect(priceManager).setAdvisedPrice(50)
                ).to.be.revertedWith('CallerNotManager')
    
            });
    
            it(' should not remove other managers', async () => {
    
                await warden.connect(admin).removeManager(priceManager.address)
    
                await expect(
                    warden.connect(externalUser).setAdvisedPrice(50)
                ).to.not.be.reverted
    
            });
    
            it(' should only be allowed for admin', async () => {
    
                await expect(
                    warden.connect(priceManager).removeManager(priceManager.address)
                ).to.be.revertedWith('Ownable: caller is not the owner')
    
                await expect(
                    warden.connect(externalUser).removeManager(externalUser.address)
                ).to.be.revertedWith('Ownable: caller is not the owner')
    
            });
    
        });

        describe('blockClaim / unblockClaim', async () => {

            const min_perc = 2000
            const max_perc = 10000

            const max_duration = 10

            let expiry_time: BigNumber

            beforeEach(async () => {

                const current_time = BigNumber.from((await provider.getBlock(await provider.getBlockNumber())).timestamp)
    
                expiry_time = current_time.add(WEEK.mul(max_duration + 3))

                await warden.connect(delegator).register(price_per_vote, max_duration, expiry_time, min_perc, max_perc, false);

                const fee_amount = ethers.utils.parseEther('100');

                await CRV.connect(receiver).approve(warden.address, fee_amount)
                await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, 10000, 1, fee_amount);

                await advanceTime(WEEK.mul(2).toNumber())

            });

            it(' should allow admin to block fee claims', async () => {

                await warden.connect(admin).blockClaim();

                await expect(
                    warden.connect(delegator).claim()
                ).to.be.revertedWith('ClaimBlocked')

            });

            it(' should allow admin to unblock the fee claims', async () => {

                await warden.connect(admin).blockClaim()

                await expect(
                    warden.connect(delegator).claim()
                ).to.be.revertedWith('ClaimBlocked')

                await warden.connect(admin).unblockClaim()

                await expect(
                    warden.connect(delegator).claim()
                ).not.to.be.reverted

            });

            it(' should block non-admin caller', async () => {

                await expect(
                    warden.connect(externalUser).blockClaim()
                ).to.be.reverted

                await expect(
                    warden.connect(externalUser).unblockClaim()
                ).to.be.reverted

            });

        });

        describe('setMinPercRequired', async () => {

            it(' should allow admin to update the parameter', async () => {

                await warden.connect(admin).setFeeReserveRatio(3000)

                expect(await warden.feeReserveRatio()).to.be.eq(3000)

            });

            it(' should fail if parameter is invalid', async () => {

                await expect(
                    warden.connect(admin).setFeeReserveRatio(10000)
                ).to.be.reverted

            });

            it(' should block non-admin caller', async () => {

                await expect(
                    warden.connect(externalUser).setFeeReserveRatio(3000)
                ).to.be.reverted

            });

        });

        describe('setMinDelegationTime', async () => {

            const new_delegation_time = 86400 * 14; // 2 weeks

            it(' should allow admin to update the parameter', async () => {

                await warden.connect(admin).setMinDelegationTime(new_delegation_time)

                expect(await warden.minDelegationTime()).to.be.eq(new_delegation_time)

            });

            it(' should fail if parameter is invalid', async () => {

                await expect(
                    warden.connect(admin).setMinDelegationTime(0)
                ).to.be.reverted

            });

            it(' should block non-admin caller', async () => {

                await expect(
                    warden.connect(externalUser).setMinDelegationTime(new_delegation_time)
                ).to.be.reverted

            });

        });

        describe('setFeeReserveRatio', async () => {

            it(' should allow admin to update the parameter', async () => {

                await warden.connect(admin).setMinPercRequired(5000)

                expect(await warden.minPercRequired()).to.be.eq(5000)

            });

            it(' should fail if parameter is invalid', async () => {

                await expect(
                    warden.connect(admin).setMinPercRequired(0)
                ).to.be.reverted

                await expect(
                    warden.connect(admin).setMinPercRequired(15000)
                ).to.be.reverted

            });

            it(' should block non-admin caller', async () => {

                await expect(
                    warden.connect(externalUser).setMinPercRequired(5000)
                ).to.be.reverted

            });

        });

        describe('setReserveManager', async () => {

            it(' should allow admin to update the parameter', async () => {

                await warden.connect(admin).setReserveManager(reserveManager.address)

                expect(await warden.reserveManager()).to.be.eq(reserveManager.address)

            });

            it(' should block non-admin caller', async () => {

                await expect(
                    warden.connect(externalUser).setReserveManager(externalUser.address)
                ).to.be.reverted

            });

        });

        describe('withdrawERC20', async () => {

            const otherERC20_address = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // DAI
            const otherERC20_holder = "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503";
            const erc20 = IERC20__factory.connect(otherERC20_address, provider);

            const lost_amount = ethers.utils.parseEther('100');

            const fee_amount = ethers.utils.parseEther('100');


            it(' should retrieve the lost tokens and send it to the admin', async () => {

                await getERC20(admin, otherERC20_holder, erc20, externalUser.address, lost_amount);

                await erc20.connect(externalUser).transfer(warden.address, lost_amount);

                const oldBalance = await erc20.balanceOf(admin.address);

                await warden.connect(admin).withdrawERC20(erc20.address, lost_amount)

                const newBalance = await erc20.balanceOf(admin.address);

                expect(newBalance.sub(oldBalance)).to.be.eq(lost_amount)

            });

            it(' should not allow to withdraw the fee Token', async () => {

                //create a boost
                await CRV.connect(receiver).approve(warden.address, fee_amount)
                await warden.connect(delegator).register(price_per_vote, 10, 0, 1000, 10000, false);
                await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, 10000, 1, fee_amount);

                await advanceTime(WEEK.mul(2).toNumber())

                const crv_amount = await CRV.balanceOf(warden.address);

                await expect(
                    warden.connect(admin).withdrawERC20(CRV.address, crv_amount)
                ).to.be.revertedWith('CannotWithdrawFeeToken')

            });

            it(' should not allow to withdraw the feeToken is claim has been blocked', async () => {

                //create a boost
                await CRV.connect(receiver).approve(warden.address, fee_amount)
                await warden.connect(delegator).register(price_per_vote, 10, 0, 1000, 10000, false);
                await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, 10000, 1, fee_amount);

                await advanceTime(WEEK.mul(2).toNumber())

                await warden.connect(admin).blockClaim()

                const crv_amount = await CRV.balanceOf(warden.address);

                const oldBalance = await CRV.balanceOf(admin.address);

                await warden.connect(admin).withdrawERC20(CRV.address, crv_amount)

                const newBalance = await CRV.balanceOf(admin.address);

                expect(newBalance.sub(oldBalance)).to.be.eq(crv_amount)

            });

            it(' should block non-admin caller', async () => {

                await expect(
                    warden.connect(externalUser).withdrawERC20(erc20.address, ethers.utils.parseEther('10'))
                ).to.be.revertedWith('Ownable: caller is not the owner')

            });

        });

        describe('depositToReserve', async () => {

            const deposit_amount = ethers.utils.parseEther('100')

            it(' should allow to deposit to the reserve', async () => {

                //set Reserve Manager
                await warden.connect(admin).setReserveManager(reserveManager.address)

                await CRV.connect(receiver).transfer(reserveManager.address, deposit_amount);

                await CRV.connect(reserveManager).approve(warden.address, deposit_amount);

                const old_reserve_amount = await warden.reserveAmount();

                const oldBalance = await CRV.balanceOf(reserveManager.address);

                await warden.connect(reserveManager).depositToReserve(reserveManager.address, deposit_amount);

                const newBalance = await CRV.balanceOf(reserveManager.address);

                const new_reserve_amount = await warden.reserveAmount();

                expect(oldBalance.sub(newBalance)).to.be.eq(deposit_amount)
                expect(new_reserve_amount).to.be.eq(old_reserve_amount.add(deposit_amount))

            });

            it(' should block non-reserveManager caller', async () => {

                await expect(
                    warden.connect(externalUser).depositToReserve(reserveManager.address, deposit_amount)
                ).to.be.revertedWith('CallerNotAllowed')

                //set Reserve Manager
                await warden.connect(admin).setReserveManager(reserveManager.address)

                await expect(
                    warden.connect(externalUser).depositToReserve(reserveManager.address, deposit_amount)
                ).to.be.revertedWith('CallerNotAllowed')

            });

        });

        describe('withdrawFromReserve', async () => {

            const fee_amount = ethers.utils.parseEther('100');

            it(' should allow to withdraw from the reserve', async () => {

                //set Reserve Manager
                await warden.connect(admin).setReserveManager(reserveManager.address)

                //create a boost
                await CRV.connect(receiver).approve(warden.address, fee_amount)
                await warden.connect(delegator).register(price_per_vote, 10, 0, 1000, 10000, false);
                await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, 10000, 1, fee_amount);

                await advanceTime(WEEK.mul(2).toNumber())

                const withdraw_amount = (await warden.reserveAmount()).div(2);

                const old_reserve_amount = await warden.reserveAmount();

                const oldBalance = await CRV.balanceOf(reserveManager.address);

                await warden.connect(reserveManager).withdrawFromReserve(withdraw_amount);

                const newBalance = await CRV.balanceOf(reserveManager.address);

                const new_reserve_amount = await warden.reserveAmount();

                expect(newBalance.sub(oldBalance)).to.be.eq(withdraw_amount)
                expect(new_reserve_amount).to.be.eq(old_reserve_amount.sub(withdraw_amount))

            });

            it(' should not allow to withdraw more then reserveAmount', async () => {

                //set Reserve Manager
                await warden.connect(admin).setReserveManager(reserveManager.address)

                await CRV.connect(receiver).approve(warden.address, fee_amount)
                await warden.connect(delegator).register(price_per_vote, 10, 0, 1000, 10000, false);
                await warden.connect(receiver).buyDelegationBoostPercent(delegator.address, receiver.address, 10000, 1, fee_amount);

                await advanceTime(WEEK.mul(2).toNumber())

                const reserve_amount = await warden.reserveAmount();

                await expect(
                    warden.connect(admin).withdrawFromReserve(reserve_amount.mul(2))
                ).to.be.revertedWith('ReserveTooLow')

            });

            it(' should block non-reserveManager caller', async () => {

                await expect(
                    warden.connect(externalUser).withdrawFromReserve(ethers.utils.parseEther('10'))
                ).to.be.revertedWith('CallerNotAllowed')

                //set Reserve Manager
                await warden.connect(admin).setReserveManager(reserveManager.address)

                await expect(
                    warden.connect(externalUser).withdrawFromReserve(ethers.utils.parseEther('10'))
                ).to.be.revertedWith('CallerNotAllowed')

            });

        });

    });

});