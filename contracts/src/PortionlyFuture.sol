// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @title PortionlyFuture
/// @notice Custodies ERC-20 savings and investment positions until their fixed unlock time.
contract PortionlyFuture is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_LOCK_DURATION = 30 days;

    struct Position {
        IERC20 asset;
        address beneficiary;
        uint256 amount;
        uint64 unlockAt;
        bool claimed;
    }

    mapping(bytes32 => Position) public positions;

    error EmptyPosition();
    error InvalidBeneficiary();
    error LockTooShort();
    error PositionExists();
    error UnlockPending();
    error AlreadyClaimed();
    error Unauthorized();

    event PositionLocked(
        bytes32 indexed positionId,
        address indexed depositor,
        address indexed beneficiary,
        address asset,
        uint256 amount,
        uint64 unlockAt
    );
    event PositionClaimed(bytes32 indexed positionId, address indexed beneficiary, address asset, uint256 amount);

    function lock(bytes32 positionId, IERC20 asset, address beneficiary, uint256 amount, uint64 unlockAt)
        external
        nonReentrant
        returns (bytes32 key)
    {
        if (address(asset) == address(0) || amount == 0) revert EmptyPosition();
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        if (uint256(unlockAt) < block.timestamp + MIN_LOCK_DURATION) revert LockTooShort();
        // Scope ids to the depositor so nobody can squat an id seen in a pending transaction.
        key = positionKey(msg.sender, positionId);
        if (address(positions[key].asset) != address(0)) revert PositionExists();

        positions[key] =
            Position({asset: asset, beneficiary: beneficiary, amount: amount, unlockAt: unlockAt, claimed: false});
        asset.safeTransferFrom(msg.sender, address(this), amount);

        emit PositionLocked(key, msg.sender, beneficiary, address(asset), amount, unlockAt);
    }

    function positionKey(address depositor, bytes32 positionId) public pure returns (bytes32) {
        return keccak256(abi.encode(depositor, positionId));
    }

    function claim(bytes32 positionId) external nonReentrant {
        Position storage position = positions[positionId];
        if (msg.sender != position.beneficiary) revert Unauthorized();
        if (position.claimed) revert AlreadyClaimed();
        if (block.timestamp < position.unlockAt) revert UnlockPending();

        position.claimed = true;
        position.asset.safeTransfer(position.beneficiary, position.amount);

        emit PositionClaimed(positionId, position.beneficiary, address(position.asset), position.amount);
    }
}
