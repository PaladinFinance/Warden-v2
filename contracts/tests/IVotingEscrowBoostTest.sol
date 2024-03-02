// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;


/** @title Custom Interface for Aladdin veFXN VotingEscrowBoost contract  */
interface IVotingEscrowBoostTest {

    event Boost(
        address indexed owner,
        address indexed receiver,
        uint256 bias,
        uint256 slope,
        uint256 start
    );

    function balanceOf(address account) external view returns (uint256);
    function allowance(address _user, address _spender) external view returns(uint256);

    function adjustedVeBalance(address account) external view returns (uint256);
    function delegatedBalance(address _user) external view returns(uint256);
    function receivedBalance(address _user) external view returns(uint256);
    function delegableBalance(address _user) external view returns(uint256);

    function checkpoint(address account) external;
    function approve(address spender, uint256 amount) external;
    function increaseAllowance(address spender, uint256 addedValue) external;
    function decreaseAllowance(address spender, uint256 subtractedValue) external;
    
    function boost(
        address receiver,
        uint256 amount,
        uint256 endtime
    ) external;
    function boostFrom(
        address owner,
        address receiver,
        uint256 amount,
        uint256 endtime
    ) external;
    function unboost(
        address owner,
        uint256 index,
        uint128 amount
    ) external;
}