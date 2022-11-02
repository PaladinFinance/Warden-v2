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

/** @title Warden Pledge contract */
/// @author Paladin
/*
    Delegation market (Pledge version) based on Curve Boost V2 contract
*/
contract WardenPledge is Owner, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants :
    uint256 public constant UNIT = 1e18;
    uint256 public constant MAX_PCT = 10000;
    uint256 public constant WEEK = 604800;

    /** @notice Minimum Pledge duration */
    uint256 public constant MIN_PLEDGE_DURATION = 1 weeks;
    /** @notice Minimum delegation time when pledging */
    uint256 public constant MIN_DELEGATION_DURATION = 2 days;

    // Storage :

    struct Pledge{
        // Target amount of veCRV (balance scaled by Boost v2, fetched as adjusted_balance)
        uint256 targetVotes;
        // Difference of votes between the target and the receiver balance at the start of the Pledge
        // (used for later extension/increase of some parameters of the Pledge)
        uint256 votesDifference;
        // Price per vote per second, set by the owner
        uint256 rewardPerVote;
        // Address to receive the Boosts
        address receiver;
        // Address of the token given as rewards to Boosters
        address rewardToken;
        // Timestamp of end of the Pledge
        uint64 endTimestamp;
        // Set to true if the Pledge is cancelled, or when closed after the endTimestamp
        bool closed;
    }

    /** @notice List of all Pledges */
    Pledge[] public pledges;

    /** @notice Owner of each Pledge (ordered by index in the pledges list) */
    mapping(uint256 => address) public pledgeOwner;
    /** @notice List of all Pledges for each owner */
    mapping(address => uint256[]) public ownerPledges;

    /** @notice Amount of rewards available for each Pledge */
    // sorted by Pledge index
    mapping(uint256 => uint256) public pledgeAvailableRewardAmounts;

    /** @notice Address of the votingToken to delegate */
    IVotingEscrow public immutable votingEscrow;
    /** @notice Address of the Delegation Boost contract */
    IBoostV2 public immutable delegationBoost;


    /** @notice Minimum amount of reward per vote for each reward token */
    // Also used to whitelist the tokens for rewards
    mapping(address => uint256) public minAmountRewardToken;
    /** @notice Total amount held in Pledge for the reward amount */
    mapping(address => uint256) public rewardTokenTotalAmount;


    /** @notice ratio of fees to pay the protocol (in BPS) */
    uint256 public protocolFeeRatio = 100;
    /** @notice Address to receive protocol fees */
    address public chestAddress;

    /** @notice Minimum vote difference for a Pledge */
    uint256 public minVoteDiff;


    // Events

    /** @notice Event emitted when a new Pledge is created */
    event NewPledge(
        address indexed creator,
        address indexed receiver,
        address indexed rewardToken,
        uint256 targetVotes,
        uint256 rewardPerVote,
        uint256 endTimestamp
    );
    /** @notice Event emitted when a Pledge duration is extended */
    event ExtendPledgeDuration(uint256 indexed pledgeId, uint256 oldEndTimestamp, uint256 newEndTimestamp);
    /** @notice Event emitted when a Pledge reward per vote is increased */
    event IncreasePledgeRewardPerVote(uint256 indexed pledgeId, uint256 oldRewardPerVote, uint256 newRewardPerVote);
    /** @notice Event emitted when a Pledge is closed */
    event ClosePledge(uint256 indexed pledgeId);
    /** @notice Event emitted when rewards are retrieved from a closed Pledge */
    event RetrievedPledgeRewards(uint256 indexed pledgeId, address receiver, uint256 amount);

    /** @notice Event emitted when an user delegate to a Pledge */
    event Pledged(uint256 indexed pledgeId, address indexed user, uint256 amount, uint256 endTimestamp);

    /** @notice Event emitted when a new reward token is added to the list */
    event NewRewardToken(address indexed token, uint256 minRewardPerSecond);
    /** @notice Event emitted when a reward token parameter is updated */
    event UpdateRewardToken(address indexed token, uint256 minRewardPerSecond);
    /** @notice Event emitted when a reward token is removed from the list */
    event RemoveRewardToken(address indexed token);

    /** @notice Event emitted when the address for the Chest is updated */
    event ChestUpdated(address oldChest, address newChest);
    /** @notice Event emitted when the platform fee is updated */
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    /** @notice Event emitted when the minimum vote difference value is updated */
    event MinVoteDiffUpdated(uint256 oldMinVoteDiff, uint256 newMinVoteDiff);



    // Constructor

    /**
    * @dev Creates the contract, set the given base parameters
    * @param _votingEscrow address of the voting token to delegate
    * @param _delegationBoost address of the contract handling delegation
    * @param _chestAddress address of the contract receiving the fees
    * @param _minVoteDiff min amount of veToken to target in a Pledge
    */
    constructor(
        address _votingEscrow,
        address _delegationBoost,
        address _chestAddress,
        uint256 _minVoteDiff
    ) {
        // We want that value to be at minimum 1e18, to avoid any rounding issues
        if(_minVoteDiff < UNIT) revert Errors.InvalidValue();
        if(_votingEscrow == address(0) || _delegationBoost == address(0) || _chestAddress == address(0)) revert Errors.ZeroAddress();

        votingEscrow = IVotingEscrow(_votingEscrow);
        delegationBoost = IBoostV2(_delegationBoost);

        chestAddress = _chestAddress;

        minVoteDiff = _minVoteDiff;
    }

    
    // View Methods

    /**
    * @notice Amount of Pledges listed in this contract
    * @dev Amount of Pledges listed in this contract
    * @return uint256: Amount of Pledges listed in this contract
    */
    function nextPledgeIndex() public view returns(uint256){
        return pledges.length;
    }

    /**
    * @notice Get all Pledges created by the user
    * @dev Get all Pledges created by the user
    * @param user Address of the user
    * @return uint256[]: List of Pledges IDs
    */
    function getUserPledges(address user) external view returns(uint256[] memory){
        return ownerPledges[user];
    }

    /**
    * @notice Get all the Pledges
    * @dev Get all the Pledges
    * @return Pledge[]: List of Pledge structs
    */
    function getAllPledges() external view returns(Pledge[] memory){
        return pledges;
    }

    /**
    * @dev Rounds down given timestamp to weekly periods
    * @param timestamp timestamp to round down
    * @return uint256: rounded down timestamp
    */
    function _getRoundedTimestamp(uint256 timestamp) internal pure returns(uint256) {
        return (timestamp / WEEK) * WEEK;
    }


    // Pledgers Methods

    /**
    * @notice Delegates boost to a given Pledge & receive rewards
    * @dev Delegates boost to a given Pledge & receive rewards
    * @param pledgeId Pledge to delegate to
    * @param amount Amount to delegate
    * @param endTimestamp End of delegation
    */
    function pledge(uint256 pledgeId, uint256 amount, uint256 endTimestamp) external nonReentrant whenNotPaused {
        _pledge(pledgeId, msg.sender, amount, endTimestamp);
    }

    /**
    * @notice Delegates boost (using a percentage of the balance) to a given Pledge & receive rewards
    * @dev Delegates boost (using a percentage of the balance) to a given Pledge & receive rewards
    * @param pledgeId Pledge to delegate to
    * @param percent Percent of balance to delegate
    * @param endTimestamp End of delegation
    */
    function pledgePercent(uint256 pledgeId, uint256 percent, uint256 endTimestamp) external nonReentrant whenNotPaused {
        if(percent > MAX_PCT) revert Errors.PercentOverMax();
        uint256 amount = (delegationBoost.delegable_balance(msg.sender) * percent) / MAX_PCT;

        _pledge(pledgeId, msg.sender, amount, endTimestamp);
        
    }

    /**
    * @dev Delegates the boost to the Pledge receiver & sends rewards to the delegator
    * @param pledgeId Pledge to delegate to
    * @param user Address of the delegator
    * @param amount Amount to delegate
    * @param endTimestamp End of delegation
    */
    function _pledge(uint256 pledgeId, address user, uint256 amount, uint256 endTimestamp) internal {
        if(amount == 0) revert Errors.NullValue();
        if(pledgeId >= pledges.length) revert Errors.InvalidPledgeID();

        // Load Pledge parameters & check the Pledge is still active
        Pledge storage pledgeParams = pledges[pledgeId];
        if(pledgeParams.closed) revert Errors.PledgeClosed();
        if(pledgeParams.endTimestamp <= block.timestamp) revert Errors.ExpiredPledge();

        // To join until the end of the pledge, user can input 0 as endTimestamp
        // so it's overridden by the Pledge's endTimestamp
        if(endTimestamp == 0) endTimestamp = pledgeParams.endTimestamp;
        if(endTimestamp > pledgeParams.endTimestamp || endTimestamp != _getRoundedTimestamp(endTimestamp)) revert Errors.InvalidEndTimestamp();

        // Calculated the effective Pledge duration
        uint256 boostDuration = endTimestamp - block.timestamp;
        if(boostDuration < MIN_DELEGATION_DURATION) revert Errors.DurationTooShort();

        // Check that the user has enough boost delegation available & set the correct allowance to this contract
        IBoostV2 _delegationBoost = delegationBoost;
        _delegationBoost.checkpoint_user(user);
        if(_delegationBoost.allowance(user, address(this)) < amount) revert Errors.InsufficientAllowance();
        if(_delegationBoost.delegable_balance(user) < amount) revert Errors.CannotDelegate();

        // Check that this will not go over the Pledge target of votes
        if(_delegationBoost.adjusted_balance_of(pledgeParams.receiver) + amount > pledgeParams.targetVotes) revert Errors.TargetVotesOverflow();

        // Creates the DelegationBoost
        _delegationBoost.boost(
            pledgeParams.receiver,
            amount,
            endTimestamp,
            user
        );

        // Re-calculate the new Boost bias & slope (using BoostV2 logic)
        uint256 slope = amount / boostDuration;
        uint256 bias = slope * boostDuration;

        if(bias == 0) revert Errors.EmptyBoost();

        // Rewards are set in the Pledge as reward/veToken/sec
        // To find the total amount of veToken delegated through the whole Boost duration
        // based on the Boost bias & the Boost duration, to take in account that the delegated amount decreases
        // each second of the Boost duration
        uint256 totalDelegatedAmount = ((bias * boostDuration) + bias) / 2;
        // Then we can calculate the total amount of rewards for this Boost
        uint256 rewardAmount = (totalDelegatedAmount * pledgeParams.rewardPerVote) / UNIT;

        address _rewardToken = pledgeParams.rewardToken;
        if(rewardAmount > pledgeAvailableRewardAmounts[pledgeId]) revert Errors.RewardsBalanceTooLow();
        pledgeAvailableRewardAmounts[pledgeId] -= rewardAmount;
        rewardTokenTotalAmount[_rewardToken] -= rewardAmount;

        // Send the rewards to the user
        IERC20(_rewardToken).safeTransfer(user, rewardAmount);

        emit Pledged(pledgeId, user, bias, endTimestamp);
    }


    // Pledge Creators Methods

    struct CreatePledgeVars {
        uint256 duration;
        uint256 votesDifference;
        uint256 totalRewardAmount;
        uint256 feeAmount;
        uint256 newPledgeID;
    }

    /**
    * @notice Creates a new Pledge
    * @dev Creates a new Pledge
    * @param receiver Address to receive the boost delegation
    * @param rewardToken Address of the token distributed as reward
    * @param targetVotes Maximum target of votes to have (own balance + delegation) for the receiver
    * @param rewardPerVote Amount of reward given for each vote delegation (per second)
    * @param endTimestamp End of the Pledge
    * @param maxTotalRewardAmount Maximum total reward amount allowed to be pulled by this contract
    * @param maxFeeAmount Maximum fee amount allowed to be pulled by this contract
    * @return uint256: Newly created Pledge ID
    */ 
    function createPledge(
        address receiver,
        address rewardToken,
        uint256 targetVotes,
        uint256 rewardPerVote, // reward/veToken/second
        uint256 endTimestamp,
        uint256 maxTotalRewardAmount,
        uint256 maxFeeAmount
    ) external nonReentrant whenNotPaused returns(uint256){
        address creator = msg.sender;

        if(receiver == address(0) || rewardToken == address(0)) revert Errors.ZeroAddress();
        uint256 _minAmountRewardToken = minAmountRewardToken[rewardToken];
        if(_minAmountRewardToken == 0) revert Errors.TokenNotWhitelisted();
        if(rewardPerVote < _minAmountRewardToken) revert Errors.RewardPerVoteTooLow();

        if(endTimestamp == 0) revert Errors.NullEndTimestamp();
        if(endTimestamp != _getRoundedTimestamp(endTimestamp) || endTimestamp < block.timestamp) revert Errors.InvalidEndTimestamp();

        CreatePledgeVars memory vars;
        vars.duration = endTimestamp - block.timestamp;
        if(vars.duration < MIN_PLEDGE_DURATION) revert Errors.DurationTooShort();

        // Get the missing votes for the given receiver to reach the target votes
        // We ignore any delegated boost here because they might expire during the Pledge duration
        // (we can have a future version of this contract using adjusted_balance)
        vars.votesDifference = targetVotes - votingEscrow.balanceOf(receiver);
        if(targetVotes < minVoteDiff) revert Errors.TargetVoteUnderMin();

        vars.totalRewardAmount = (rewardPerVote * vars.votesDifference * vars.duration) / UNIT;
        vars.feeAmount = (vars.totalRewardAmount * protocolFeeRatio) / MAX_PCT ;
        if(vars.totalRewardAmount > maxTotalRewardAmount) revert Errors.IncorrectMaxTotalRewardAmount();
        if(vars.feeAmount > maxFeeAmount) revert Errors.IncorrectMaxFeeAmount();

        // Pull all the rewards in this contract
        IERC20(rewardToken).safeTransferFrom(creator, address(this), vars.totalRewardAmount);
        // And transfer the fees from the Pledge creator to the Chest contract
        IERC20(rewardToken).safeTransferFrom(creator, chestAddress, vars.feeAmount);

        vars.newPledgeID = pledges.length;

        // Add the total rewards as available for the Pledge & write Pledge parameters in storage
        pledgeAvailableRewardAmounts[vars.newPledgeID] = vars.totalRewardAmount;
        rewardTokenTotalAmount[rewardToken] += vars.totalRewardAmount;

        pledges.push(Pledge(
            targetVotes,
            vars.votesDifference,
            rewardPerVote,
            receiver,
            rewardToken,
            safe64(endTimestamp),
            false
        ));

        pledgeOwner[vars.newPledgeID] = creator;
        ownerPledges[creator].push(vars.newPledgeID);

        emit NewPledge(creator, receiver, rewardToken, targetVotes, rewardPerVote, endTimestamp);

        return vars.newPledgeID;
    }

    /**
    * @notice Extends the Pledge duration
    * @dev Extends the Pledge duration & add rewards for that new duration
    * @param pledgeId ID of the Pledge
    * @param newEndTimestamp New end of the Pledge
    * @param maxTotalRewardAmount Maximum added total reward amount allowed to be pulled by this contract
    * @param maxFeeAmount Maximum fee amount allowed to be pulled by this contract
    */
    function extendPledge(
        uint256 pledgeId,
        uint256 newEndTimestamp,
        uint256 maxTotalRewardAmount,
        uint256 maxFeeAmount
    ) external nonReentrant whenNotPaused {
        if(pledgeId >= pledges.length) revert Errors.InvalidPledgeID();
        address creator = pledgeOwner[pledgeId];
        if(msg.sender != creator) revert Errors.NotPledgeCreator();

        Pledge storage pledgeParams = pledges[pledgeId];
        uint256 oldEndTimestamp = pledgeParams.endTimestamp;
        if(pledgeParams.closed) revert Errors.PledgeClosed();
        if(oldEndTimestamp <= block.timestamp) revert Errors.ExpiredPledge();
        address _rewardToken = pledgeParams.rewardToken;
        if(minAmountRewardToken[_rewardToken] == 0) revert Errors.TokenNotWhitelisted();
        if(pledgeParams.rewardPerVote < minAmountRewardToken[_rewardToken]) revert Errors.RewardPerVoteTooLow();

        if(newEndTimestamp == 0) revert Errors.NullEndTimestamp();
        if(newEndTimestamp != _getRoundedTimestamp(newEndTimestamp) || newEndTimestamp < oldEndTimestamp) revert Errors.InvalidEndTimestamp();

        uint256 addedDuration = newEndTimestamp - oldEndTimestamp;
        if(addedDuration < MIN_PLEDGE_DURATION) revert Errors.DurationTooShort();
        uint256 totalRewardAmount = (pledgeParams.rewardPerVote * pledgeParams.votesDifference * addedDuration) / UNIT;
        uint256 feeAmount = (totalRewardAmount * protocolFeeRatio) / MAX_PCT ;
        if(totalRewardAmount > maxTotalRewardAmount) revert Errors.IncorrectMaxTotalRewardAmount();
        if(feeAmount > maxFeeAmount) revert Errors.IncorrectMaxFeeAmount();


        // Pull all the rewards in this contract
        IERC20(_rewardToken).safeTransferFrom(creator, address(this), totalRewardAmount);
        // And transfer the fees from the Pledge creator to the Chest contract
        IERC20(_rewardToken).safeTransferFrom(creator, chestAddress, feeAmount);

        // Update the Pledge parameters in storage
        pledgeParams.endTimestamp = safe64(newEndTimestamp);

        pledgeAvailableRewardAmounts[pledgeId] += totalRewardAmount;
        rewardTokenTotalAmount[_rewardToken] += totalRewardAmount;

        emit ExtendPledgeDuration(pledgeId, oldEndTimestamp, newEndTimestamp);
    }

    /**
    * @notice Increases the Pledge reward per vote delegated
    * @dev Increases the Pledge reward per vote delegated & add rewards for that new duration
    * @param pledgeId ID of the Pledge
    * @param newRewardPerVote New amount of reward given for each vote delegation (per second)
    * @param maxTotalRewardAmount Maximum added total reward amount allowed to be pulled by this contract
    * @param maxFeeAmount Maximum fee amount allowed to be pulled by this contract
    */
    function increasePledgeRewardPerVote(
        uint256 pledgeId,
        uint256 newRewardPerVote,
        uint256 maxTotalRewardAmount,
        uint256 maxFeeAmount
    ) external nonReentrant whenNotPaused {
        if(pledgeId >= pledges.length) revert Errors.InvalidPledgeID();
        address creator = pledgeOwner[pledgeId];
        if(msg.sender != creator) revert Errors.NotPledgeCreator();

        Pledge storage pledgeParams = pledges[pledgeId];
        if(pledgeParams.closed) revert Errors.PledgeClosed();
        if(pledgeParams.endTimestamp <= block.timestamp) revert Errors.ExpiredPledge();
        address _rewardToken = pledgeParams.rewardToken;
        if(minAmountRewardToken[_rewardToken] == 0) revert Errors.TokenNotWhitelisted();
        if(pledgeParams.rewardPerVote < minAmountRewardToken[_rewardToken]) revert Errors.RewardPerVoteTooLow();

        uint256 oldRewardPerVote = pledgeParams.rewardPerVote;
        if(newRewardPerVote <= oldRewardPerVote) revert Errors.RewardsPerVotesTooLow();
        uint256 remainingDuration = pledgeParams.endTimestamp - block.timestamp;
        uint256 rewardPerVoteDiff = newRewardPerVote - oldRewardPerVote;
        uint256 totalRewardAmount = (rewardPerVoteDiff * pledgeParams.votesDifference * remainingDuration) / UNIT;
        uint256 feeAmount = (totalRewardAmount * protocolFeeRatio) / MAX_PCT ;
        if(totalRewardAmount > maxTotalRewardAmount) revert Errors.IncorrectMaxTotalRewardAmount();
        if(feeAmount > maxFeeAmount) revert Errors.IncorrectMaxFeeAmount();

        // Pull all the rewards in this contract
        IERC20(_rewardToken).safeTransferFrom(creator, address(this), totalRewardAmount);
        // And transfer the fees from the Pledge creator to the Chest contract
        IERC20(_rewardToken).safeTransferFrom(creator, chestAddress, feeAmount);

        // Update the Pledge parameters in storage
        pledgeParams.rewardPerVote = newRewardPerVote;

        pledgeAvailableRewardAmounts[pledgeId] += totalRewardAmount;
        rewardTokenTotalAmount[_rewardToken] += totalRewardAmount;

        emit IncreasePledgeRewardPerVote(pledgeId, oldRewardPerVote, newRewardPerVote);
    }

    /**
    * @notice Closes a Pledge and retrieves all non-distributed rewards from a Pledge
    * @dev Closes a Pledge and retrieves all non-distributed rewards from a Pledge & send them to the given receiver
    * @param pledgeId ID of the Pledge to close
    * @param receiver Address to receive the remaining rewards
    */
    function closePledge(uint256 pledgeId, address receiver) external nonReentrant {
        if(receiver == address(0) || receiver == address(this)) revert Errors.InvalidValue();
        if(pledgeId >= pledges.length) revert Errors.InvalidPledgeID();
        address creator = pledgeOwner[pledgeId];
        if(msg.sender != creator) revert Errors.NotPledgeCreator();

        Pledge storage pledgeParams = pledges[pledgeId];
        if(pledgeParams.closed) revert Errors.PledgeAlreadyClosed();

        // Set the Pledge as Closed
        pledgeParams.closed = true;

        // Get the current remaining amount of rewards not distributed for the Pledge
        uint256 remainingAmount = pledgeAvailableRewardAmounts[pledgeId];

        if(remainingAmount != 0) {
            // Transfer the non-used rewards and reset storage
            pledgeAvailableRewardAmounts[pledgeId] = 0;
            address _rewardToken = pledgeParams.rewardToken;
            rewardTokenTotalAmount[_rewardToken] -= remainingAmount;

            IERC20(_rewardToken).safeTransfer(receiver, remainingAmount);

            emit RetrievedPledgeRewards(pledgeId, receiver, remainingAmount);

        }

        emit ClosePledge(pledgeId);
    }


    // Admin Methods

    /**
    * @dev Adds a given reward token to the whitelist
    * @param token Address of the token
    * @param minRewardPerSecond Minimum amount of reward per vote per second for the token
    */
    function _addRewardToken(address token, uint256 minRewardPerSecond) internal {
        if(token == address(0)) revert Errors.ZeroAddress();
        if(minRewardPerSecond == 0) revert Errors.NullValue();
        if(minAmountRewardToken[token] != 0) revert Errors.AlreadyAllowedToken();
        
        minAmountRewardToken[token] = minRewardPerSecond;

        emit NewRewardToken(token, minRewardPerSecond);
    }

    /**
    * @notice Adds a given reward token to the whitelist
    * @dev Adds a given reward token to the whitelist
    * @param tokens List of token addresses to add
    * @param minRewardsPerSecond Minimum amount of reward per vote per second for each token in the list
    */
    function addMultipleRewardToken(address[] calldata tokens, uint256[] calldata minRewardsPerSecond) external onlyOwner {
        uint256 length = tokens.length;

        if(length == 0) revert Errors.EmptyArray();
        if(length != minRewardsPerSecond.length) revert Errors.UnequalArraySizes();

        for(uint256 i; i < length;){
            _addRewardToken(tokens[i], minRewardsPerSecond[i]);

            unchecked{ ++i; }
        }
    }

    /**
    * @notice Adds a given reward token to the whitelist
    * @dev Adds a given reward token to the whitelist
    * @param token Address of the token
    * @param minRewardPerSecond Minimum amount of reward per vote per second for the token
    */
    function addRewardToken(address token, uint256 minRewardPerSecond) external onlyOwner {
        _addRewardToken(token, minRewardPerSecond);
    }

    /**
    * @notice Updates a reward token
    * @dev Updates a reward token
    * @param token Address of the token
    * @param minRewardPerSecond Minimum amount of reward per vote per second for the token
    */
    function updateRewardToken(address token, uint256 minRewardPerSecond) external onlyOwner {
        if(token == address(0)) revert Errors.ZeroAddress();
        if(minAmountRewardToken[token] == 0) revert Errors.NotAllowedToken();
        if(minRewardPerSecond == 0) revert Errors.InvalidValue();

        minAmountRewardToken[token] = minRewardPerSecond;

        emit UpdateRewardToken(token, minRewardPerSecond);
    }

    /**
    * @notice Removes a reward token from the whitelist
    * @dev Removes a reward token from the whitelist
    * @param token Address of the token
    */
    function removeRewardToken(address token) external onlyOwner {
        if(token == address(0)) revert Errors.ZeroAddress();
        if(minAmountRewardToken[token] == 0) revert Errors.NotAllowedToken();
        
        minAmountRewardToken[token] = 0;
        
        emit RemoveRewardToken(token);
    }
    
    /**
    * @notice Updates the Chest address
    * @dev Updates the Chest address
    * @param chest Address of the new Chest
    */
    function updateChest(address chest) external onlyOwner {
        if(chest == address(0) || chest == address(this)) revert Errors.InvalidAddress();
        address oldChest = chestAddress;
        chestAddress = chest;

        emit ChestUpdated(oldChest, chest);
    }

    /**
    * @notice Updates the new min difference of votes for Pledges
    * @dev Updates the new min difference of votes for Pledges
    * @param newMinVoteDiff New minimum difference of votes
    */
    function updateMinVoteDiff(uint256 newMinVoteDiff) external onlyOwner {
        // We want that value to be at minimum 1e18, to avoid any rounding issues
        if(newMinVoteDiff < UNIT) revert Errors.InvalidValue();
        uint256 oldMinTarget = minVoteDiff;
        minVoteDiff = newMinVoteDiff;

        emit MinVoteDiffUpdated(oldMinTarget, newMinVoteDiff);
    }

    /**
    * @notice Updates the platform fees BPS ratio
    * @dev Updates the platform fees BPS ratio
    * @param newFee New fee ratio
    */
    function updatePlatformFee(uint256 newFee) external onlyOwner {
        if(newFee > 500 || newFee == 0) revert Errors.InvalidValue();
        uint256 oldFee = protocolFeeRatio;
        protocolFeeRatio = newFee;

        emit PlatformFeeUpdated(oldFee, newFee);
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
    * @notice Recovers ERC2O tokens sent by mistake to the contract
    * @dev Recovers ERC2O tokens sent by mistake to the contract
    * @param token Address of the ERC2O token
    * @return bool: success
    */
    function recoverERC20(address token) external nonReentrant onlyOwner returns(bool) {

        uint256 currentBalance = IERC20(token).balanceOf(address(this));
        if(currentBalance == 0) revert Errors.NullValue();
        uint256 amount;

        // Total amount of the token owned by the Pledges
        uint256 pledgesBalance = rewardTokenTotalAmount[token];

        if(pledgesBalance >= currentBalance) revert Errors.CannotRecoverToken();
        amount = currentBalance - pledgesBalance;

        if(amount != 0) {
            IERC20(token).safeTransfer(owner(), amount);
        }
        
        return true;
    }

    // Utils 

    function safe64(uint256 n) internal pure returns (uint64) {
        if(n > type(uint64).max) revert Errors.NumberExceed64Bits();
        return uint64(n);
    }


}