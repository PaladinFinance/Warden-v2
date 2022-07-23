// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./oz/interfaces/IERC20.sol";
import "./oz/libraries/SafeERC20.sol";
import "./Warden.sol";
import "./interfaces/IVotingEscrow.sol";
import "./interfaces/IBoostV2.sol";

/** @title Lens of the Warden contract  */
/// @author Paladin
contract WardenLens {

    uint256 public constant UNIT = 1e18;
    uint256 public constant MAX_PCT = 10000;
    uint256 public constant MAX_UINT = 2**256 - 1;
    uint256 public constant WEEK = 7 * 86400;

    IVotingEscrow public votingEscrow;
    IBoostV2 public delegationBoost;
    Warden public warden;

    constructor(
        address _votingEscrow,
        address _delegationBoost,
        address _warden
    ) {
        votingEscrow = IVotingEscrow(_votingEscrow);
        delegationBoost = IBoostV2(_delegationBoost);
        warden = Warden(_warden);
    }

    function getUserClaimableBoosts(address user) external view returns(uint256[] memory) {
        uint256[] memory userBoosts = warden.getUserPurchasedBoosts(user);
        uint256 length = userBoosts.length;

        uint256[] memory claimableBoosts = new uint256[](length);
        uint256 j;

        for(uint256 i; i < length;){

            Warden.PurchasedBoost memory boost = warden.getPurchasedBoost(userBoosts[i]);

            if(!boost.claimed){
                claimableBoosts[j] = userBoosts[i];
                j++;
            }

            unchecked{ ++i; }
        }

        return claimableBoosts;
    }

    struct Prices {
        uint256 highest;
        uint256 lowest;
        uint256 median;
    }

    function getPrices() external view returns(Prices memory prices) {
        uint256 totalNbOffers = warden.offersIndex();
        uint256 sumPrices;

        if(totalNbOffers <= 1) return prices; //Case where no Offer in the list

        prices.lowest = MAX_UINT; //Set max amount as lowest value instead of 0

        for(uint256 i = 1; i < totalNbOffers;){ //since the offer at index 0 is useless
            (,uint256 offerPrice,,,,) = warden.getOffer(i);

            sumPrices += offerPrice;

            if(offerPrice > prices.highest){
                prices.highest = offerPrice;
            }
            if(offerPrice < prices.lowest && offerPrice != 0){
                prices.lowest = offerPrice;
            }

            unchecked{ ++i; }
        }

        prices.median = sumPrices / (totalNbOffers - 1);

        return prices;
        
    }

}