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
contract WardenX is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants :
    uint256 public constant UNIT = 1e18;
    uint256 public constant MAX_PCT = 10000;
    uint256 public constant WEEK = 7 * 86400;

    // Storage :

    struct Pledge{
        // Target amount of veCRV (balance scaled by Boost v2, fetched as adjusted_balance)
        uint256 targetVotes;
        // Price per vote per second, set by the owner
        uint256 rewardPerVote;
        // Address to receive the Boosts
        address receiver;
        // Address of the token given as rewards to Boosters
        address rewardToken;
        // Timestamp of end of the Pledge
        uint64 endTimestamp;
        // Set to true if the Pledge is canceled, or when closed after the endTimestamp
        bool closed;
    }

    Pledge[] public pledges;

    mapping(uint256 => address) public pledgeOwner;
    mapping(address => uint256[]) public ownerPledges;

    // sorted by Pledge index
    mapping(uint256 => uint256) public pledgeAvailableRewardAmounts;


    /** @notice Address of the votingToken to delegate */
    IVotingEscrow public votingEscrow;
    /** @notice Address of the Delegation Boost contract */
    IBoostV2 public delegationBoost;


    // Also used to whitelist the tokens for rewards
    mapping(address => uint256) public minAmountRewardToken;


    /** @notice ratio of fees to pay the protocol (in BPS) */
    uint256 public protocalFeeRatio = 250; //bps
    /** @notice Address to receive protocol fees */
    address public chestAddress;

    uint256 public minTargetVotes;

    /** @notice Min Percent of delegator votes to buy required to purchase a Delegation Boost (in BPS) */
    uint256 public minPercRequired; //bps

    /** @notice Minimum delegation time, taken from veBoost contract */
    uint256 public minDelegationTime = 1 weeks;


    // Events

    event NewPledge(
        address creator,
        address receiver,
        address rewardToken,
        uint256 targetVotes,
        uint256 rewardPerVote,
        uint256 endTimestamp
    );
    event ExtendPledgeDuration(uint256 indexed pledgeId, uint256 oldEndTimestamp, uint256 newEndTimestamp);
    event IncreasePledgeTargetVotes(uint256 indexed pledgeId, uint256 oldTargetVotes, uint256 newTargetVotes);
    event IncreasePledgeRewardPerVote(uint256 indexed pledgeId, uint256 oldRewardPerVote, uint256 newRewardPerVote);
    event CanceledPledge(uint256 indexed pledgeId);
    event RetrievedPledgeRewards(uint256 indexed pledgeId, address receiver, uint256 amount);

    event Pledged(uint256 indexed pledgeId, address indexed user, uint256 amount, uint256 endTimestamp);

    event NewRewardToken(address indexed token, uint256 minRewardPerSecond);
    event UpdateRewardToken(address indexed token, uint256 minRewardPerSecond);
    event RemoveRewardToken(address indexed token);

    event ChestUpdated(address oldChest, address newChest);
    event PlatformFeeUpdated(uint256 oldfee, uint256 newFee);
    event MinTargetUpdated(uint256 oldMinTarget, uint256 newMinTargetVotes);



    // Constructor

    /**
     * @dev Creates the contract, set the given base parameters
     * @param _votingEscrow address of the voting token to delegate
     * @param _delegationBoost address of the contract handling delegation
     * @param _minTargetVotes min amount of veToken to target in a Pledge
     */
    constructor(
        address _votingEscrow,
        address _delegationBoost,
        uint256 _minTargetVotes
    ) {
        votingEscrow = IVotingEscrow(_votingEscrow);
        delegationBoost = IBoostV2(_delegationBoost);

        minTargetVotes = _minTargetVotes;
    }

    
    // View Methods

    /**
     * @notice Amount of Pledges listed in this contract
     * @dev Amount of Pledges listed in this contract
     */
    function pledgesIndex() public view returns(uint256){
        return pledges.length;
    }

    function getUserPledges(address user) external view returns(uint256[] memory){
        return ownerPledges[user];
    }

    function getAllPledges() external view returns(Pledge[] memory){
        return pledges;
    }

    function _getRoundedTimestamp(uint256 timestamp) internal pure returns(uint256) {
        return (timestamp / WEEK) * WEEK;
    }


    // Pledgers Methods

    function pledge(uint256 pledgeId, uint256 amount, uint256 endTimestamp) external nonReentrant {
        _pledge(pledgeId, msg.sender, amount, endTimestamp);
    }

    function pledgePercent(uint256 pledgeId, uint256 percent, uint256 endTimestamp) external nonReentrant {
        if(percent > MAX_PCT) revert Errors.PercentOverMax();

        uint256 amount = (votingEscrow.balanceOf(msg.sender) * percent) / MAX_PCT;

        _pledge(pledgeId, msg.sender, amount, endTimestamp);
        
    }

    function _pledge(uint256 pledgeId, address user, uint256 amount, uint256 endTimestamp) internal {
        if(pledgeId >= pledgesIndex()) revert Errors.InvalidPledgeID();

        Pledge memory pledgeParams = pledges[pledgeId];
        if(pledgeParams.closed) revert Errors.PledgeClosed();
        if(pledgeParams.endTimestamp <= block.timestamp) revert Errors.ExpiredPledge();

        // To join until the end of the pledge, user can input 0 as endTimestamp
        // so it's override by the Pledge's endTimestemp
        if(endTimestamp == 0) endTimestamp = pledgeParams.endTimestamp;
        if(endTimestamp > pledgeParams.endTimestamp || endTimestamp != _getRoundedTimestamp(endTimestamp)) revert Errors.InvalidEndTimestamp();

        uint256 boostDuration = endTimestamp - block.timestamp;

        delegationBoost.checkpoint_user(user);
        if(delegationBoost.delegable_balance(user) < amount) revert Errors.CannotDelegate();

        if(delegationBoost.adjusted_balance_of(pledgeParams.receiver) + amount > pledgeParams.targetVotes) revert Errors.TargetVotesOverflow();

        // Creates the DelegationBoost
        delegationBoost.boost(
            pledgeParams.receiver,
            amount,
            endTimestamp,
            user
        );

        uint256 slope = amount / boostDuration;
        uint256 bias = slope * boostDuration;

        // Rewards are set in the Pledge as reward/veToken/sec
        // To find the total amount of veToken through the whole Boost duration:
        uint256 totalAmountToReward = ((bias * boostDuration) + bias) / 2;
        // Then we can calculate the total amount of rewards for this Boost
        uint256 rewardAmount = (totalAmountToReward * pledgeParams.rewardPerVote) / UNIT;

        if(rewardAmount > pledgeAvailableRewardAmounts[pledgeId]) revert Errors.RewardsBalanceTooLow();
        pledgeAvailableRewardAmounts[pledgeId] -= rewardAmount;

        IERC20(pledgeParams.rewardToken).safeTransfer(user, rewardAmount);

        emit Pledged(pledgeId, user, amount, endTimestamp);
    }


    // Pledge Creators Methods

    function createPledge(
        address receiver,
        address rewardToken,
        uint256 targetVotes,
        uint256 rewardPerVote, // reward/veToken/second
        uint256 endTimestamp,
        uint256 totalRewardAmount,
        uint256 feeAmount
    ) external nonReentrant returns(uint256){
        address creator = msg.sender;

        if(receiver == address(0) || rewardToken == address(0)) revert Errors.ZeroAddress();
        if(targetVotes < minTargetVotes) revert Errors.TargetVoteUnderMin();
        if(minAmountRewardToken[rewardToken] == 0) revert Errors.TokenNotWhitelisted();
        if(rewardPerVote < minAmountRewardToken[rewardToken]) revert Errors.RewardPerVoteTooLow();

        if(endTimestamp != _getRoundedTimestamp(endTimestamp)) revert Errors.InvalidEndTimestemp();
        uint256 duration = endTimestamp - block.timestamp;
        if(duration < minDelegationTime) revert Errors.DurationTooShort();

        if(((rewardPerVote * targetVotes * duration) / UNIT) != totalRewardAmount) revert Errors.IncorrectTotalRewardAmount();
        if((totalRewardAmount * protocalFeeRatio) / MAX_PCT != feeAmount) revert Errors.IncorrectFeeAmount();

        // Pull all the rewards in this contract
        IERC20(rewardToken).safeTransferFrom(creator, address(this), totalRewardAmount);
        // And transfer the fees from the Pledge creator to the Chest contract
        IERC20(rewardToken).safeTransferFrom(creator, chestAddress, feeAmount);

        uint256 newPledgeID = pledgesIndex();

        pledgeAvailableRewardAmounts[newPledgeID] += totalRewardAmount;

        pledges.push(Pledge(
            targetVotes,
            rewardPerVote,
            receiver,
            rewardToken,
            safe64(endTimestamp),
            false
        ));

        pledgeOwner[newPledgeID] = creator;
        ownerPledges[creator].push(newPledgeID);

        emit NewPledge(creator, receiver, rewardToken, targetVotes, rewardPerVote, endTimestamp);

        return newPledgeID;
    }

    function extendPledge(
        uint256 pledgeId,
        uint256 newEndTimestamp,
        uint256 totalRewardAmount,
        uint256 feeAmount
    ) external nonReentrant {
        address creator = pledgeOwner[pledgeId];
        if(msg.sender != creator) revert Errors.NotPledgeCreator();

        if(newEndTimestamp != _getRoundedTimestamp(newEndTimestamp)) revert Errors.InvalidEndTimestemp();

        Pledge storage pledgeParams = pledges[pledgeId];
        if(pledgeParams.closed) revert Errors.PledgeClosed();
        if(pledgeParams.endTimestamp <= block.timestamp) revert Errors.ExpiredPledge();

        uint256 oldEndTimestamp = pledgeParams.endTimestamp;
        uint256 addedDuration = newEndTimestamp - oldEndTimestamp;
        if(addedDuration < minDelegationTime) revert Errors.DurationTooShort();
        if(((pledgeParams.rewardPerVote * pledgeParams.targetVotes * addedDuration) / UNIT) != totalRewardAmount) revert Errors.IncorrectTotalRewardAmount();
        if((totalRewardAmount * protocalFeeRatio) / MAX_PCT != feeAmount) revert Errors.IncorrectFeeAmount();

        // Pull all the rewards in this contract
        IERC20(pledgeParams.rewardToken).safeTransferFrom(creator, address(this), totalRewardAmount);
        // And transfer the fees from the Pledge creator to the Chest contract
        IERC20(pledgeParams.rewardToken).safeTransferFrom(creator, chestAddress, feeAmount);

        pledgeParams.endTimestamp = safe64(newEndTimestamp);

        pledgeAvailableRewardAmounts[pledgeId] += totalRewardAmount;

        emit ExtendPledgeDuration(pledgeId, oldEndTimestamp, newEndTimestamp);
    }

    function increasePledgeTargetVotes(
        uint256 pledgeId,
        uint256 newTargetVotes,
        uint256 maxTotalRewardAmount,
        uint256 maxFeeAmount
    ) external nonReentrant {
        address creator = pledgeOwner[pledgeId];
        if(msg.sender != creator) revert Errors.NotPledgeCreator();

        Pledge storage pledgeParams = pledges[pledgeId];
        if(pledgeParams.closed) revert Errors.PledgeClosed();
        if(pledgeParams.endTimestamp <= block.timestamp) revert Errors.ExpiredPledge();

        uint256 oldTargetVotes = pledgeParams.targetVotes;
        if(newTargetVotes <= oldTargetVotes) revert Errors.TargetVotesTooLoow();
        uint256 remainingDuration = pledgeParams.endTimestamp - block.timestamp;
        uint256 totalRewardAmount = (pledgeParams.rewardPerVote * newTargetVotes * remainingDuration) / UNIT;
        uint256 feeAmount = (totalRewardAmount * protocalFeeRatio) / MAX_PCT ;
        if(totalRewardAmount > maxTotalRewardAmount) revert Errors.IncorrectTotalRewardAmount();
        if(feeAmount > maxFeeAmount) revert Errors.IncorrectFeeAmount();

        // Pull all the rewards in this contract
        IERC20(pledgeParams.rewardToken).safeTransferFrom(creator, address(this), totalRewardAmount);
        // And transfer the fees from the Pledge creator to the Chest contract
        IERC20(pledgeParams.rewardToken).safeTransferFrom(creator, chestAddress, feeAmount);

        pledgeParams.targetVotes = newTargetVotes;

        pledgeAvailableRewardAmounts[pledgeId] += totalRewardAmount;

        emit IncreasePledgeTargetVotes(pledgeId, oldTargetVotes, newTargetVotes);
    }

    function increasePledgeRewardPerVote(
        uint256 pledgeId,
        uint256 newRewardPerVote,
        uint256 maxTotalRewardAmount,
        uint256 maxFeeAmount
    ) external nonReentrant {
        address creator = pledgeOwner[pledgeId];
        if(msg.sender != creator) revert Errors.NotPledgeCreator();

        Pledge storage pledgeParams = pledges[pledgeId];
        if(pledgeParams.closed) revert Errors.PledgeClosed();
        if(pledgeParams.endTimestamp <= block.timestamp) revert Errors.ExpiredPledge();

        uint256 oldRewardPerVote = pledgeParams.rewardPerVote;
        if(newRewardPerVote <= oldRewardPerVote) revert Errors.TargetVotesTooLoow();
        uint256 remainingDuration = pledgeParams.endTimestamp - block.timestamp;
        uint256 totalRewardAmount = (newRewardPerVote * pledgeParams.targetVotes * remainingDuration) / UNIT;
        uint256 feeAmount = (totalRewardAmount * protocalFeeRatio) / MAX_PCT ;
        if(totalRewardAmount > maxTotalRewardAmount) revert Errors.IncorrectTotalRewardAmount();
        if(feeAmount > maxFeeAmount) revert Errors.IncorrectFeeAmount();

        // Pull all the rewards in this contract
        IERC20(pledgeParams.rewardToken).safeTransferFrom(creator, address(this), totalRewardAmount);
        // And transfer the fees from the Pledge creator to the Chest contract
        IERC20(pledgeParams.rewardToken).safeTransferFrom(creator, chestAddress, feeAmount);

        pledgeParams.rewardPerVote = newRewardPerVote;

        pledgeAvailableRewardAmounts[pledgeId] += totalRewardAmount;

        emit IncreasePledgeRewardPerVote(pledgeId, oldRewardPerVote, newRewardPerVote);
    }

    function retrievePledgeRewards(uint256 pledgeId, address receiver) external nonReentrant {
        address creator = pledgeOwner[pledgeId];
        if(msg.sender != creator) revert Errors.NotPledgeCreator();
        if(receiver == address(0)) revert Errors.ZeroAddress();

        Pledge storage pledgeParams = pledges[pledgeId];
        if(pledgeParams.endTimestamp > block.timestamp) revert Errors.PledgeNotExpired();

        uint256 remainingAmount = pledgeAvailableRewardAmounts[pledgeId];

        if(!pledgeParams.closed) pledgeParams.closed = true;

        if(remainingAmount > 0) {
            pledgeAvailableRewardAmounts[pledgeId] = 0;

            IERC20(pledgeParams.rewardToken).safeTransfer(receiver, remainingAmount);

            emit RetrievedPledgeRewards(pledgeId, receiver, remainingAmount);

        }
    }

    function cancelPledge(uint256 pledgeId, address receiver) external nonReentrant {
        address creator = pledgeOwner[pledgeId];
        if(msg.sender != creator) revert Errors.NotPledgeCreator();
        if(receiver == address(0)) revert Errors.ZeroAddress();

        Pledge storage pledgeParams = pledges[pledgeId];
        if(pledgeParams.closed) revert Errors.PledgeAlreadyClosed();
        if(pledgeParams.endTimestamp <= block.timestamp) revert Errors.ExpiredPledge();

        pledgeParams.closed = true;

        uint256 remainingAmount = pledgeAvailableRewardAmounts[pledgeId];

        if(remainingAmount > 0) {
            pledgeAvailableRewardAmounts[pledgeId] = 0;

            IERC20(pledgeParams.rewardToken).safeTransfer(receiver, remainingAmount);

            emit RetrievedPledgeRewards(pledgeId, receiver, remainingAmount);

        }

        emit CanceledPledge(pledgeId);
    }


    // Admin Methods

    function _addRewardToken(address token, uint256 minRewardPerSecond) internal {
        if(minAmountRewardToken[token] != 0) revert Errors.AlreadyAllowedToken();
        if(token == address(0)) revert Errors.ZeroAddress();
        if(minRewardPerSecond == 0) revert Errors.NullValue();
        
        minAmountRewardToken[token] = minRewardPerSecond;

        emit NewRewardToken(token, minRewardPerSecond);
    }

    function addMultipleRewardToken(address[] calldata tokens, uint256[] calldata minRewardsPerSecond) external onlyOwner {
        uint256 length = tokens.length;

        if(length == 0) revert Errors.EmptyArray();
        if(length != minRewardsPerSecond.length) revert Errors.InequalArraySizes();

        for(uint256 i = 0; i < length;){
            _addRewardToken(tokens[i], minRewardsPerSecond[i]);

            unchecked{ ++i; }
        }
    }

    function addRewardToken(address token, uint256 minRewardPerSecond) external onlyOwner {
        _addRewardToken(token, minRewardPerSecond);
    }

    function updateRewardToken(address token, uint256 minRewardPerSecond) external onlyOwner {
        if(minAmountRewardToken[token] == 0) revert Errors.NotAllowedToken();
        if(minRewardPerSecond == 0) revert Errors.InvalidValue();

        minAmountRewardToken[token] = minRewardPerSecond;

        emit UpdateRewardToken(token, minRewardPerSecond);
    }

    function removeRewardToken(address token) external onlyOwner {
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
        if(chest == address(0)) revert Errors.ZeroAddress();
        address oldChest = chestAddress;
        chestAddress = chest;

        emit ChestUpdated(oldChest, chest);
    }

    /**
    * @notice Updates the new min target of votes for Pledges
    * @dev Updates the new min target of votes for Pledges
    * @param newMinTargetVotes New minimum target of votes
    */
    function updateMinTargetVotes(uint256 newMinTargetVotes) external onlyOwner {
        if(newMinTargetVotes == 0) revert Errors.InvalidValue();
        uint256 oldMinTarget = minTargetVotes;
        minTargetVotes = newMinTargetVotes;

        emit MinTargetUpdated(oldMinTarget, newMinTargetVotes);
    }

    /**
    * @notice Updates the Platfrom fees BPS ratio
    * @dev Updates the Platfrom fees BPS ratio
    * @param newFee New fee ratio
    */
    function updatePlatformFee(uint256 newFee) external onlyOwner {
        if(newFee > 500) revert Errors.InvalidValue();
        uint256 oldfee = protocalFeeRatio;
        protocalFeeRatio = newFee;

        emit PlatformFeeUpdated(oldfee, newFee);
    }

    /**
    * @notice Recovers ERC2O tokens sent by mistake to the contract
    * @dev Recovers ERC2O tokens sent by mistake to the contract
    * @param token Address tof the EC2O token
    * @return bool: success
    */
    function recoverERC20(address token) external onlyOwner returns(bool) {
        if(minAmountRewardToken[token] != 0) revert Errors.CannotRecoverToken();

        uint256 amount = IERC20(token).balanceOf(address(this));
        if(amount == 0) revert Errors.NullValue();
        IERC20(token).safeTransfer(owner(), amount);

        return true;
    }

    // Utils 

    function safe64(uint256 n) internal pure returns (uint64) {
        if(n > type(uint64).max) revert Errors.NumberExceed64Bits();
        return uint64(n);
    }


}