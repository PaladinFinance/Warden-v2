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
        uint256 targetVotes;
        // Price per vote per second, set by the owner
        uint256 pricePerVote;
        address receiver;
        address rewardToken;
        // Timestamp of end of the Pledge
        uint64 endTimestamp;
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
    uint256 public protocalFeeRatio; //bps
    /** @notice Address to receive protocol fees */
    address public chestAddress;


    /** @notice Min Percent of delegator votes to buy required to purchase a Delegation Boost (in BPS) */
    uint256 public minPercRequired; //bps

    /** @notice Minimum delegation time, taken from veBoost contract */
    uint256 public minDelegationTime = 1 weeks;


    // Events

    event NewRewardToken(address indexed token, uint256 minRewardPerSecond);
    event UpdateRewardToken(address indexed token, uint256 minRewardPerSecond);
    event RemoveRewardToken(address indexed token);

    event ChestUpdated(address oldChest, address newChest);
    event PlatformFeeUpdated(uint256 oldfee, uint256 newFee);



    // Constructor

    /**
     * @dev Creates the contract, set the given base parameters
     * @param _votingEscrow address of the voting token to delegate
     * @param _delegationBoost address of the contract handling delegation
     * @param _protocalFeeRatio Percent of fees to be set as Reserve (bps)
     */
    constructor(
        address _votingEscrow,
        address _delegationBoost,
        uint256 _protocalFeeRatio //bps
    ) {
        votingEscrow = IVotingEscrow(_votingEscrow);
        delegationBoost = IBoostV2(_delegationBoost);

        require(_protocalFeeRatio <= 5000);
        protocalFeeRatio = _protocalFeeRatio;
    }

    
    // View Methods

    /**
     * @notice Amount of Pledges listed in this market
     * @dev Amount of Pledges listed in this market
     */
    function pledgesIndex() external view returns(uint256){
        return pledges.length;
    }

    function getUserPledges(address user) external view returns(uint256[] memory){
        return ownerPledges[user];
    }


    // Write Methods





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


}