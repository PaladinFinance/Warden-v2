// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./oz/interfaces/IERC20.sol";
import "./oz/libraries/SafeERC20.sol";
import "./utils/Owner.sol";
import "./oz/utils/Pausable.sol";
import "./oz/utils/ReentrancyGuard.sol";
import "./interfaces/IVotingEscrow.sol";
import "./interfaces/IBoostV2.sol";
import "./utils/Errors.sol";

/** @title Warden contract V2 */
/// @author Paladin
/*
    Delegation market based on Curve VotingEscrowDelegation contract
*/
contract Warden is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants :
    uint256 public constant UNIT = 1e18;
    uint256 public constant MAX_PCT = 10000;
    uint256 public constant WEEK = 7 * 86400;
    uint256 public constant MAX_UINT = 2**256 - 1;

    // Storage :

    /** @notice Offer made by an user to buy a given amount of his votes 
    user : Address of the user making the offer
    pricePerVote : Price per vote per second, set by the user
    minPerc : Minimum percent of users voting token balance to buy for a Boost (in BPS)
    maxPerc : Maximum percent of users total voting token balance available to delegate (in BPS)
    */
    struct BoostOffer {
        // Address of the user making the offer
        address user;
        // Price per vote per second, set by the user
        uint256 pricePerVote;
        // Max duration a Boost from this offer can last
        uint64 maxDuration;
        // Timestamp of expiry of the Offer
        uint64 expiryTime;
        // Minimum percent of users voting token balance to buy for a Boost
        uint16 minPerc; //bps
        // Maximum percent of users total voting token balance available to delegate
        uint16 maxPerc; //bps
        // Use the advised price instead of the Offer one
        bool useAdvicePrice;
    }

    /** @notice ERC20 used to pay for DelegationBoost */
    IERC20 public feeToken;
    /** @notice Address of the votingToken to delegate */
    IVotingEscrow public votingEscrow;
    /** @notice Address of the Delegation Boost contract */
    IBoostV2 public delegationBoost;

    /** @notice ratio of fees to be set as Reserve (in BPS) */
    uint256 public feeReserveRatio; //bps
    /** @notice Total Amount in the Reserve */
    uint256 public reserveAmount;
    /** @notice Address allowed to withdraw from the Reserve */
    address public reserveManager;

    /** @notice Min Percent of delegator votes to buy required to purchase a Delegation Boost (in BPS) */
    uint256 public minPercRequired; //bps

    /** @notice Minimum delegation time, taken from veBoost contract */
    uint256 public minDelegationTime = 1 weeks;

    /** @notice List of all current registered users and their delegation offer */
    BoostOffer[] public offers;

    /** @notice Index of the user in the offers array */
    mapping(address => uint256) public userIndex;

    /** @notice Amount of fees earned by users through Boost selling */
    mapping(address => uint256) public earnedFees;

    bool private _claimBlocked;

    /** @notice Price per vote advised by the managers for users that don't handle their pricing themselves */
    uint256 public advisedPrice;

    /** @notice Address approved to manage the advised price */
    mapping(address => bool) public approvedManagers;

    /** @notice ID for the next purchased Boost */
    uint256 public nextBoostId = 1; // because we use ID 0 as an invalid one in the MultiBuy system


    // Events :

    event Registred(address indexed user, uint256 price);

    event UpdateOffer(address indexed user, uint256 newPrice);
    event UpdateOfferPrice(address indexed user, uint256 newPrice);

    event Quit(address indexed user);

    event BoostPurchase(
        address indexed delegator,
        address indexed receiver,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint256 paidFeeAmount,
        uint256 expiryTime
    );

    event Claim(address indexed user, uint256 amount);

    event NewAdvisedPrice(uint256 newPrice);


    modifier onlyAllowed(){
        if(msg.sender != reserveManager && msg.sender != owner()) revert Errors.CallerNotAllowed();
        _;
    }

    // Constructor :
    /**
     * @dev Creates the contract, set the given base parameters
     * @param _feeToken address of the token used to pay fees
     * @param _votingEscrow address of the voting token to delegate
     * @param _delegationBoost address of the contract handling delegation
     * @param _feeReserveRatio Percent of fees to be set as Reserve (bps)
     * @param _minPercRequired Minimum percent of user
     * @param _advisedPrice Starting advised price
     */
    constructor(
        address _feeToken,
        address _votingEscrow,
        address _delegationBoost,
        uint256 _feeReserveRatio, //bps
        uint256 _minPercRequired, //bps
        uint256 _advisedPrice
    ) {
        feeToken = IERC20(_feeToken);
        votingEscrow = IVotingEscrow(_votingEscrow);
        delegationBoost = IBoostV2(_delegationBoost);

        require(_advisedPrice > 0);
        advisedPrice = _advisedPrice;

        require(_feeReserveRatio <= 5000);
        require(_minPercRequired > 0 && _minPercRequired <= 10000);
        feeReserveRatio = _feeReserveRatio;
        minPercRequired = _minPercRequired;

        // fill index 0 in the offers array
        // since we want to use index 0 for unregistered users
        offers.push(BoostOffer(address(0), 0, 0, 0, 0, 0, false));
    }

    // Functions :

    /**
     * @notice Amount of Offer listed in this market
     * @dev Amount of Offer listed in this market
     */
    function offersIndex() external view returns(uint256){
        return offers.length;
    }

    /**
     * @notice Returns the current period
     * @dev Calculates and returns the current period based on current timestamp
     */
    function currentPeriod() public view returns(uint256) {
        return (block.timestamp / WEEK) * WEEK;
    }

    /**
     * @notice Registers a new user wanting to sell its delegation
     * @dev Regsiters a new user, creates a BoostOffer with the given parameters
     * @param pricePerVote Price of 1 vote per second (in wei)
     * @param maxDuration Maximum duration (in weeks) that a Boost can last when taken from this Offer
     * @param expiryTime Timestamp when this Offer is not longer valid
     * @param minPerc Minimum percent of users voting token balance to buy for a Boost (in BPS)
     * @param maxPerc Maximum percent of users total voting token balance available to delegate (in BPS)
     * @param useAdvicePrice True to use the advice Price instead of the given pricePerVote
     */
    function register(
        uint256 pricePerVote,
        uint64 maxDuration,
        uint64 expiryTime,
        uint16 minPerc,
        uint16 maxPerc,
        bool useAdvicePrice
    ) external whenNotPaused returns(bool) {
        address user = msg.sender;
        if(userIndex[user] != 0) revert Errors.AlreadyRegistered();
        if(delegationBoost.allowance(user, address(this)) != MAX_UINT) revert Errors.WardenNotOperator();

        if(pricePerVote == 0) revert Errors.NullPrice();
        if(maxPerc > 10000) revert Errors.MaxPercTooHigh();
        if(minPerc > maxPerc) revert Errors.MinPercOverMaxPerc();
        if(minPerc < minPercRequired) revert Errors.MinPercTooLow();
        if(maxDuration == 0) revert Errors.NullMaxDuration();
        if(expiryTime != 0 && expiryTime < (block.timestamp + WEEK)) revert Errors.IncorrectExpiry();

        if(expiryTime == 0) expiryTime = uint64(votingEscrow.locked__end(user));

        // Create the BoostOffer for the new user, and add it to the storage
        userIndex[user] = offers.length;
        offers.push(BoostOffer(user, pricePerVote, maxDuration, expiryTime, minPerc, maxPerc, useAdvicePrice));

        emit Registred(user, pricePerVote);

        return true;
    }

    /**
     * @notice Updates an user BoostOffer parameters
     * @dev Updates parameters for the user's BoostOffer
     * @param pricePerVote Price of 1 vote per second (in wei)
     * @param maxDuration Maximum duration (in weeks) that a Boost can last when taken from this Offer
     * @param expiryTime Timestamp when this Offer is not longer valid
     * @param minPerc Minimum percent of users voting token balance to buy for a Boost (in BPS)
     * @param maxPerc Maximum percent of users total voting token balance available to delegate (in BPS)
     * @param useAdvicePrice True to use the advice Price instead of the given pricePerVote
     */
    function updateOffer(
        uint256 pricePerVote,
        uint64 maxDuration,
        uint64 expiryTime,
        uint16 minPerc,
        uint16 maxPerc,
        bool useAdvicePrice
    ) external whenNotPaused returns(bool) {
        // Fetch the user index, and check for registration
        address user = msg.sender;
        uint256 index = userIndex[user];
        if(index == 0) revert Errors.NotRegistered();

        // Fetch the BoostOffer to update
        BoostOffer storage offer = offers[index];

        if(offer.user != msg.sender) revert Errors.NotOfferOwner();

        if(pricePerVote == 0) revert Errors.NullPrice();
        if(maxPerc > 10000) revert Errors.MaxPercTooHigh();
        if(minPerc > maxPerc) revert Errors.MinPercOverMaxPerc();
        if(minPerc < minPercRequired) revert Errors.MinPercTooLow();
        if(maxDuration == 0) revert Errors.NullMaxDuration();
        if(expiryTime != 0 && expiryTime < (block.timestamp + WEEK)) revert Errors.IncorrectExpiry();

        if(expiryTime == 0) expiryTime = uint64(votingEscrow.locked__end(user));

        // Update the parameters
        offer.pricePerVote = pricePerVote;
        offer.maxDuration = maxDuration;
        offer.expiryTime = expiryTime;
        offer.minPerc = minPerc;
        offer.maxPerc = maxPerc;
        offer.useAdvicePrice = useAdvicePrice;

        emit UpdateOffer(user, useAdvicePrice ? advisedPrice : pricePerVote);

        return true;
    }

    /**
     * @notice Updates an user BoostOffer price parameters
     * @dev Updates an user BoostOffer price parameters
     * @param pricePerVote Price of 1 vote per second (in wei)
     * @param useAdvicePrice Bool: use advised price
     */
    function updateOfferPrice(
        uint256 pricePerVote,
        bool useAdvicePrice
    ) external whenNotPaused returns(bool) {
        // Fet the user index, and check for registration
        address user = msg.sender;
        uint256 index = userIndex[user];
        if(index == 0) revert Errors.NotRegistered();

        // Fetch the BoostOffer to update
        BoostOffer storage offer = offers[index];

        if(offer.user != msg.sender) revert Errors.NotOfferOwner();

        if(pricePerVote == 0) revert Errors.NullPrice();

        // Update the parameters
        offer.pricePerVote = pricePerVote;
        offer.useAdvicePrice = useAdvicePrice;

        emit UpdateOfferPrice(user, useAdvicePrice ? advisedPrice : pricePerVote);

        return true;
    }

    /**
     * @notice Returns the Offer data
     * @dev Returns the Offer struct from storage
     * @param index Index of the Offer in the list
     */
    function getOffer(uint256 index) external view returns(
        address user,
        uint256 pricePerVote,
        uint64 maxDuration,
        uint64 expiryTime,
        uint16 minPerc,
        uint16 maxPerc
    ) {
        BoostOffer storage offer = offers[index];
        return(
            offer.user,
            offer.useAdvicePrice ? advisedPrice : offer.pricePerVote,
            offer.maxDuration,
            offer.expiryTime,
            offer.minPerc,
            offer.maxPerc
        );
    }

    /**
     * @notice Remove the BoostOffer of the user, and claim any remaining fees earned
     * @dev User's BoostOffer is removed from the listing, and any unclaimed fees is sent
     */
    function quit() external whenNotPaused nonReentrant returns(bool) {
        address user = msg.sender;
        if(userIndex[user] == 0) revert Errors.NotRegistered();

        // Check for unclaimed fees, claim it if needed
        if (earnedFees[user] > 0) {
            _claim(user, earnedFees[user]);
        }

        // Find the BoostOffer to remove
        uint256 currentIndex = userIndex[user];
        // If BoostOffer is not the last of the list
        // Replace last of the list with the one to remove
        if (currentIndex < offers.length) {
            uint256 lastIndex = offers.length - 1;
            address lastUser = offers[lastIndex].user;
            offers[currentIndex] = offers[lastIndex];
            userIndex[lastUser] = currentIndex;
        }
        //Remove the last item of the list
        offers.pop();
        userIndex[user] = 0;

        emit Quit(user);

        return true;
    }

    /**
     * @notice Checks if the delegator has enough available balance & the Offer allows to delegate the given amount
     * @dev Checks if the delegator has enough available balance & the Offer allows to delegate the given amount
     * @param delegator Address of the delegator for the Boost
     * @param amount Amount ot delegate
     */
    function canDelegate(address delegator, uint256 amount) external view returns(bool) {
        uint256 userMaxPercent = (offers[userIndex[delegator]]).maxPerc;

        return _canDelegate(delegator, amount, userMaxPercent);
    }

    /**
     * @notice Checks if the delegator has enough available balance & the Offer allows to delegate the given amount
     * @dev Checks if the delegator has enough available balance & the Offer allows to delegate the given amount
     * @param delegator Address of the delegator for the Boost
     * @param percent Percent of the delegator balance to delegate (in BPS)
     */
    function canDelegatePercent(address delegator, uint256 percent) external view returns(bool) {
        uint256 userMaxPercent = (offers[userIndex[delegator]]).maxPerc;

        if(percent > userMaxPercent) return false;

        uint256 amount = (votingEscrow.balanceOf(delegator) * percent) / MAX_PCT;

        return _canDelegate(delegator, amount, userMaxPercent);
    }

    /**
     * @notice Gives an estimate of fees to pay for a given Boost Delegation
     * @dev Calculates the amount of fees for a Boost Delegation with the given amount (through the percent) and the duration
     * @param delegator Address of the delegator for the Boost
     * @param amount Amount ot delegate
     * @param duration Duration (in weeks) of the Boost to purchase
     */
    function estimateFees(
        address delegator,
        uint256 amount,
        uint256 duration //in weeks
    ) external view returns (uint256) {
        if(delegator == address(0)) revert Errors.ZeroAddress();
        if(userIndex[delegator] == 0) revert Errors.NotRegistered();

        uint256 percent = (amount * MAX_PCT) / votingEscrow.balanceOf(delegator);

        BoostOffer storage offer = offers[userIndex[delegator]];
        if(percent < minPercRequired) revert Errors.PercentUnderMinRequired();
        if(percent > MAX_PCT) revert Errors.PercentOverMax();

        if(percent < offer.minPerc || percent > offer.maxPerc) 
            revert Errors.PercentOutOfferBonds();

        return _estimateFees(delegator, amount, duration);
    }

    /**
     * @notice Gives an estimate of fees to pay for a given Boost Delegation
     * @dev Calculates the amount of fees for a Boost Delegation with the given amount (through the percent) and the duration
     * @param delegator Address of the delegator for the Boost
     * @param percent Percent of the delegator balance to delegate (in BPS)
     * @param duration Duration (in weeks) of the Boost to purchase
     */
    function estimateFeesPercent(
        address delegator,
        uint256 percent,
        uint256 duration //in weeks
    ) external view returns (uint256) {
        if(delegator == address(0)) revert Errors.ZeroAddress();
        if(userIndex[delegator] == 0) revert Errors.NotRegistered();
        if(percent < minPercRequired) revert Errors.PercentUnderMinRequired();
        if(percent > MAX_PCT) revert Errors.PercentOverMax();

        // Fetch the BoostOffer for the delegator
        BoostOffer storage offer = offers[userIndex[delegator]];

        if(percent < offer.minPerc || percent > offer.maxPerc) 
            revert Errors.PercentOutOfferBonds();

        uint256 amount = (votingEscrow.balanceOf(delegator) * percent) / MAX_PCT;

        return _estimateFees(delegator, amount, duration);
    }

    /**
     * @notice Buy a Delegation Boost for a Delegator Offer
     * @dev If all parameters match the offer from the delegator, creates a Boost for the caller
     * @param delegator Address of the delegator for the Boost
     * @param receiver Address of the receiver of the Boost
     * @param amount  Amount to delegate
     * @param duration Duration (in weeks) of the Boost to purchase
     * @param maxFeeAmount Maximum amount of feeToken available to pay to cover the Boost Duration (in wei)
     * returns the id of the new veBoost
     */
    function buyDelegationBoost(
        address delegator,
        address receiver,
        uint256 amount,
        uint256 duration, //in weeks
        uint256 maxFeeAmount
    ) external nonReentrant whenNotPaused returns(uint256) {
        if(delegator == address(0) || receiver == address(0)) revert Errors.ZeroAddress();
        if(userIndex[delegator] == 0) revert Errors.NotRegistered();
        if(maxFeeAmount == 0) revert Errors.NullFees();
        if(amount == 0) revert Errors.NullValue();

        uint256 percent = (amount * MAX_PCT) / votingEscrow.balanceOf(delegator);

        BoostOffer storage offer = offers[userIndex[delegator]];
        if(percent < minPercRequired) revert Errors.PercentUnderMinRequired();
        if(percent > MAX_PCT) revert Errors.PercentOverMax();
        if(percent < offer.minPerc || percent > offer.maxPerc) revert Errors.PercentOutOfferBonds();

        return _buyDelegationBoost(delegator, receiver, amount, duration, maxFeeAmount);
    }

    /**
     * @notice Buy a Delegation Boost for a Delegator Offer
     * @dev If all parameters match the offer from the delegator, creates a Boost for the caller
     * @param delegator Address of the delegator for the Boost
     * @param receiver Address of the receiver of the Boost
     * @param percent Percent of the delegator balance to delegate (in BPS)
     * @param duration Duration (in weeks) of the Boost to purchase
     * @param maxFeeAmount Maximum amount of feeToken available to pay to cover the Boost Duration (in wei)
     * returns the id of the new veBoost
     */
    function buyDelegationBoostPercent(
        address delegator,
        address receiver,
        uint256 percent,
        uint256 duration, //in weeks
        uint256 maxFeeAmount
    ) external nonReentrant whenNotPaused returns(uint256) {
        if(delegator == address(0) || receiver == address(0)) revert Errors.ZeroAddress();
        if(userIndex[delegator] == 0) revert Errors.NotRegistered();
        if(maxFeeAmount == 0) revert Errors.NullFees();
        if(percent < minPercRequired) revert Errors.PercentUnderMinRequired();
        if(percent > MAX_PCT) revert Errors.PercentOverMax();

        BoostOffer storage offer = offers[userIndex[delegator]];
        if(percent < offer.minPerc || percent > offer.maxPerc) revert Errors.PercentOutOfferBonds();

        uint256 amount = (votingEscrow.balanceOf(delegator) * percent) / MAX_PCT;

        return _buyDelegationBoost(delegator, receiver, amount, duration, maxFeeAmount);
    }

    /**
     * @notice Returns the amount of fees earned by the user that can be claimed
     * @dev Returns the value in earnedFees for the given user
     * @param user Address of the user
     */
    function claimable(address user) external view returns (uint256) {
        return earnedFees[user];
    }

    /**
     * @notice Claims all earned fees
     * @dev Send all the user's earned fees
     */
    function claim() external nonReentrant returns(bool) {
        if(earnedFees[msg.sender] == 0) revert Errors.NullClaimAmount();
        return _claim(msg.sender, earnedFees[msg.sender]);
    }

    function _estimateFees(
        address delegator,
        uint256 amount,
        uint256 duration //in weeks
    ) internal view returns (uint256) {
        // Fetch the BoostOffer for the delegator
        BoostOffer storage offer = offers[userIndex[delegator]];

        //Check that the duration is less or equal to Offer maxDuration
        if(duration > offer.maxDuration) revert Errors.DurationOverOfferMaxDuration();
        if(block.timestamp > offer.expiryTime) revert Errors.OfferExpired();
        // Get the duration in seconds, and check it's more than the minimum required
        uint256 boostDuration = duration * WEEK;
        if(boostDuration < minDelegationTime) revert Errors.DurationTooShort();

        // Because the BoostV2 expects end_timestamps to be rounded by week,
        // and we want to round up instead of down (so user purchasing the minimal duration (1 week)
        // have at least than minimal duration). Since the Boost cannot be canceled, we expect the user to pay
        // for the effective duration of the boost
        uint256 expiryTime = ((block.timestamp + boostDuration) / WEEK) * WEEK;
        expiryTime = (expiryTime < block.timestamp + boostDuration) ?
            ((block.timestamp + boostDuration + WEEK) / WEEK) * WEEK :
            expiryTime;
        if(expiryTime > votingEscrow.locked__end(delegator)) revert Errors.LockEndTooShort();
        // Real Boost duration (for fees)
        boostDuration = expiryTime - block.timestamp;

        // Choose between the Offer price or the advised one based on delegator choice
        uint256 pricePerVote = offer.useAdvicePrice ? advisedPrice : offer.pricePerVote;

        // Return estimated max price for the whole Boost duration at this block
        return (amount * pricePerVote * boostDuration) / UNIT;
    }

    struct BuyVars {
        uint256 boostDuration;
        uint256 expiryTime;
        uint256 pricePerVote;
        uint256 realFeeAmount;
        uint256 newTokenId;
        uint256 currentPeriod;
        uint256 currentRewardIndex;
        uint256 boostWeeklyDecrease;
        uint256 nextPeriod;
    }

    function _buyDelegationBoost(
        address delegator,
        address receiver,
        uint256 amount,
        uint256 duration, //in weeks
        uint256 maxFeeAmount
    ) internal returns(uint256) {

        BuyVars memory vars;

        // Fetch the BoostOffer for the delegator
        BoostOffer storage offer = offers[userIndex[delegator]];

        //Check that the duration is less or equal to Offer maxDuration
        if(duration > offer.maxDuration) revert Errors.DurationOverOfferMaxDuration();
        if(block.timestamp > offer.expiryTime) revert Errors.OfferExpired();

        // Get the duration of the wanted Boost in seconds
        vars.boostDuration = duration * WEEK;
        if(vars.boostDuration < minDelegationTime) revert Errors.DurationTooShort();

        // Calcualte the expiry time for the Boost = now + duration
        vars.expiryTime = ((block.timestamp + vars.boostDuration) / WEEK) * WEEK;

        // Hack needed because veBoost contract expects end_timestamp rounded by week
        // We don't want buyers to receive less than they pay for
        // So an "extra" week is added if needed to get an expire_time covering the required duration
        // Because the BoostOffer V2 does not allow to cancel Boosts, we expect the user to pay
        // for the effective duration of the boost
        vars.expiryTime = (vars.expiryTime < block.timestamp + vars.boostDuration) ?
            ((block.timestamp + vars.boostDuration + WEEK) / WEEK) * WEEK :
            vars.expiryTime;
        if(vars.expiryTime > votingEscrow.locked__end(delegator)) revert Errors.LockEndTooShort();
        // Real Boost duration (for fees)
        vars.boostDuration = vars.expiryTime - block.timestamp;

        // Check if delegator can delegate the amount, without exceeding the maximum percent allowed by the delegator
        // _canDelegate will also try to cancel expired Boosts of the deelgator to free more tokens for delegation
        delegationBoost.checkpoint_user(delegator);
        if(!_canDelegate(delegator, amount, offer.maxPerc)) revert Errors.CannotDelegate();

        // Choose between the Offer price or the advised one based on delegator choice
        vars.pricePerVote = offer.useAdvicePrice ? advisedPrice : offer.pricePerVote;

        // Calculate the price for the given duration, get the real amount of fees to pay,
        // and check the maxFeeAmount provided (and approved beforehand) is enough.
        vars.realFeeAmount = (amount * vars.pricePerVote * vars.boostDuration) / UNIT;
        if(vars.realFeeAmount > maxFeeAmount) revert Errors.FeesTooLow();

        // Pull the tokens from the buyer, setting it as earned fees for the delegator (and part of it for the Reserve)
        _pullFees(msg.sender, vars.realFeeAmount, delegator);

        // Get the id for the new Boost
        vars.newTokenId = nextBoostId;
        nextBoostId++;

        // Creates the DelegationBoost
        delegationBoost.boost(
            receiver,
            amount,
            vars.expiryTime,
            delegator
        );

        emit BoostPurchase(
            delegator,
            receiver,
            vars.newTokenId,
            amount,
            vars.pricePerVote,
            vars.realFeeAmount,
            vars.expiryTime
        );

        return vars.newTokenId;

    }

    function _pullFees(
        address buyer,
        uint256 amount,
        address seller
    ) internal {
        // Pull the given token amount ot this contract (must be approved beforehand)
        feeToken.safeTransferFrom(buyer, address(this), amount);

        // Split fees between Boost offerer & Reserve
        earnedFees[seller] += (amount * (MAX_PCT - feeReserveRatio)) / MAX_PCT;
        reserveAmount += (amount * feeReserveRatio) / MAX_PCT;
    }

    function _canDelegate(
        address delegator,
        uint256 amount,
        uint256 delegatorMaxPerc
    ) internal view returns (bool) {
        // Handles both the case where user just approved a given amount to this contract
        // or approved for the MAX_UINT256 (which is the easiest setting in our case)
        if (delegationBoost.allowance(delegator, address(this)) < amount)
            return false;

        // Delegator current balance
        uint256 balance = votingEscrow.balanceOf(delegator);

        // Percent of delegator balance not allowed to delegate (as set by maxPerc in the BoostOffer)
        uint256 blockedBalance = (balance * (MAX_PCT - delegatorMaxPerc)) / MAX_PCT;
        uint256 delegableBalance = delegationBoost.delegable_balance(delegator);

        // If the current delegableBalance is the the part of the balance not allowed for this market
        if(delegableBalance < blockedBalance) return false;

        // Available Balance to delegate = Current Undelegated Balance - Blocked Balance
        uint256 availableBalance = delegableBalance - blockedBalance;

        if (amount <= availableBalance) return true;

        return false;
    }

    function _claim(address user, uint256 amount) internal returns(bool) {
        if(_claimBlocked) revert Errors.ClaimBlocked();
        if(amount > feeToken.balanceOf(address(this))) revert Errors.InsufficientCash();

        if(amount == 0) return true; // nothing to claim, but used in claimAndCancel()

        // If fees to be claimed, update the mapping, and send the amount
        unchecked{
            // Should not underflow, since the amount was either checked in the claim() method, or set as earnedFees[user]
            earnedFees[user] -= amount;
        }

        feeToken.safeTransfer(user, amount);

        emit Claim(user, amount);

        return true;
    }

    // Manager methods:

    /**
     * @notice Updates the advised price
     * @param newPrice New price perv ote per second (in wei)
     */
    function setAdvisedPrice(uint256 newPrice) external {
        if(!approvedManagers[msg.sender]) revert Errors.CallerNotManager();
        if(newPrice == 0) revert Errors.NullValue();
        advisedPrice = newPrice;

        emit NewAdvisedPrice(newPrice);
    }

    // Admin Functions :

    /**
     * @notice Updates the minimum percent required to buy a Boost
     * @param newMinPercRequired New minimum percent required to buy a Boost (in BPS)
     */
    function setMinPercRequired(uint256 newMinPercRequired) external onlyOwner {
        if(newMinPercRequired == 0 || newMinPercRequired > 10000) revert Errors.InvalidValue();
        minPercRequired = newMinPercRequired;
    }

        /**
     * @notice Updates the minimum delegation time
     * @param newMinDelegationTime New minimum deelgation time (in seconds)
     */
    function setMinDelegationTime(uint256 newMinDelegationTime) external onlyOwner {
        if(newMinDelegationTime == 0) revert Errors.NullValue();
        minDelegationTime = newMinDelegationTime;
    }

    /**
     * @notice Updates the ratio of Fees set for the Reserve
     * @param newFeeReserveRatio New ratio (in BPS)
     */
    function setFeeReserveRatio(uint256 newFeeReserveRatio) external onlyOwner {
        if(newFeeReserveRatio > 5000) revert Errors.InvalidValue();
        feeReserveRatio = newFeeReserveRatio;
    }

    /**
     * @notice Updates the Delegation Boost (veBoost)
     * @param newDelegationBoost New veBoost contract address
     */
    function setDelegationBoost(address newDelegationBoost) external onlyOwner {
        delegationBoost = IBoostV2(newDelegationBoost);
    }

    /**
     * @notice Updates the Reserve Manager
     * @param newReserveManager New Reserve Manager address
     */
    function setReserveManager(address newReserveManager) external onlyOwner {
        reserveManager = newReserveManager;
    }

    /**
    * @notice Approves a new address as manager 
    * @dev Approves a new address as manager
    * @param newManager Address to add
    */
    function approveManager(address newManager) external onlyOwner {
        if(newManager == address(0)) revert Errors.ZeroAddress();
        approvedManagers[newManager] = true;
    }
   
    /**
    * @notice Removes an address from the managers
    * @dev Removes an address from the managers
    * @param manager Address to remove
    */
    function removeManager(address manager) external onlyOwner {
        if(manager == address(0)) revert Errors.ZeroAddress();
        approvedManagers[manager] = false;
    }

    /**
     * @notice Pauses the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Block user fee claims
     */
    function blockClaim() external onlyOwner {
        if(_claimBlocked) revert Errors.ClaimBlocked();
        _claimBlocked = true;
    }

    /**
     * @notice Unblock user fee claims
     */
    function unblockClaim() external onlyOwner {
        if(!_claimBlocked) revert Errors.ClaimNotBlocked();
        _claimBlocked = false;
    }

    /**
     * @dev Withdraw either a lost ERC20 token sent to the contract (expect the feeToken)
     * @param token ERC20 token to withdraw
     * @param amount Amount to transfer (in wei)
     */
    function withdrawERC20(address token, uint256 amount) external onlyOwner returns(bool) {
        if(!_claimBlocked && token == address(feeToken)) revert Errors.CannotWithdrawFeeToken(); //We want to be able to recover the fees if there is an issue
        IERC20(token).safeTransfer(owner(), amount);

        return true;
    }

    /**
     * @notice Deposit fee token in the reserve
     * @param from Address to pull the tokens from
     * @param amount Amount of token to deposit
     */
    function depositToReserve(address from, uint256 amount) external onlyAllowed returns(bool) {
        reserveAmount = reserveAmount + amount;
        feeToken.safeTransferFrom(from, address(this), amount);

        return true;
    }

    /**
     * @notice Withdraw fee tokens from the reserve to send to the Reserve Manager
     * @param amount Amount of token to withdraw
     */
    function withdrawFromReserve(uint256 amount) external onlyAllowed returns(bool) {
        if(amount > reserveAmount) revert Errors.ReserveTooLow();
        reserveAmount = reserveAmount - amount;
        feeToken.safeTransfer(reserveManager, amount);

        return true;
    }
}
