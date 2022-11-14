// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;


/** @title Custom Interface for Curve VotingEscrowStateOracle contract  */
interface IVotingEscrowStateOracle {

    struct LockedBalance {
        int128 amount;
        uint256 end;
    }
    
    function balanceOf(address _account) external view returns (uint256);

    function locked(address _account) external view returns (LockedBalance memory);

    function submit_state(address _user, bytes memory _block_header_rlp, bytes memory _proof_rlp) external;

    function set_eth_blockhash(uint256 _eth_block_number, bytes32 __eth_blockhash) external;

    function owner() external view returns(address);

}