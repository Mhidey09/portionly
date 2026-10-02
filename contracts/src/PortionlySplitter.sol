// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

interface IUpshiftVault {
    function deposit(address asset, uint256 amount, address receiver) external returns (uint256 shares);
}

interface IAUSD is IERC20 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

interface IPortionlyFuture {
    function lock(bytes32 positionId, IERC20 asset, address beneficiary, uint256 amount, uint64 unlockAt) external;
}

/// @title PortionlySplitter
/// @notice Atomically routes AUSD into immediate funds and time-locked Upshift vault shares.
contract PortionlySplitter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Plan {
        address recipient;
        uint256 nowAmount;
        uint256 growAmount;
        uint64 unlockAt;
        uint256 deadline;
        bytes32 planId;
    }

    IERC20 public immutable ausd;
    IUpshiftVault public immutable vault;
    IERC20 public immutable vaultShare;
    IPortionlyFuture public immutable future;
    mapping(address sender => mapping(bytes32 planId => bool executed)) public planExecuted;

    error EmptyPlan();
    error EmptyPlanId();
    error AuthorizationPlanMismatch();
    error InvalidConfiguration();
    error InvalidRecipient();
    error PlanAlreadyUsed();
    error PlanExpired();

    event PlanExecuted(
        bytes32 indexed planId,
        address indexed sender,
        address indexed recipient,
        uint256 nowAmount,
        uint256 growAmount,
        uint256 growShares
    );

    constructor(IERC20 ausd_, address vault_, IERC20 vaultShare_, address future_) {
        if (
            address(ausd_) == address(0) || vault_ == address(0) || address(vaultShare_) == address(0)
                || future_ == address(0)
        ) revert InvalidConfiguration();
        ausd = ausd_;
        vault = IUpshiftVault(vault_);
        vaultShare = vaultShare_;
        future = IPortionlyFuture(future_);
    }

    function execute(Plan calldata plan) external nonReentrant returns (uint256 growShares) {
        uint256 total = _validatePlan(plan);
        _consumePlan(msg.sender, plan.planId);
        ausd.safeTransferFrom(msg.sender, address(this), total);
        growShares = _route(msg.sender, plan);
    }

    function executeWithAuthorization(
        address sender,
        Plan calldata plan,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 growShares) {
        uint256 total = _validatePlan(plan);
        if (nonce != authorizationNonce(sender, plan)) revert AuthorizationPlanMismatch();
        _consumePlan(sender, plan.planId);
        IAUSD(address(ausd))
            .receiveWithAuthorization(sender, address(this), total, validAfter, validBefore, nonce, v, r, s);
        growShares = _route(sender, plan);
    }

    /// @notice Returns the nonce an AUSD ERC-3009 authorization must sign for this exact plan.
    function authorizationNonce(address sender, Plan calldata plan) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                bytes32("PORTIONLY_PLAN_V1"),
                block.chainid,
                address(this),
                sender,
                plan.recipient,
                plan.nowAmount,
                plan.growAmount,
                plan.unlockAt,
                plan.deadline,
                plan.planId
            )
        );
    }

    function _validatePlan(Plan calldata plan) private view returns (uint256 total) {
        if (plan.recipient == address(0)) revert InvalidRecipient();
        if (plan.planId == bytes32(0)) revert EmptyPlanId();
        if (block.timestamp > plan.deadline) revert PlanExpired();

        total = plan.nowAmount + plan.growAmount;
        if (total == 0) revert EmptyPlan();
    }

    function _consumePlan(address sender, bytes32 planId) private {
        if (planExecuted[sender][planId]) revert PlanAlreadyUsed();
        planExecuted[sender][planId] = true;
    }

    function _route(address sender, Plan calldata plan) private returns (uint256 growShares) {
        if (plan.nowAmount != 0) {
            ausd.safeTransfer(plan.recipient, plan.nowAmount);
        }

        if (plan.growAmount != 0) {
            bool isLocked = plan.unlockAt != 0;
            address shareReceiver = isLocked ? address(this) : plan.recipient;

            ausd.forceApprove(address(vault), plan.growAmount);
            growShares = vault.deposit(address(ausd), plan.growAmount, shareReceiver);
            ausd.forceApprove(address(vault), 0);

            if (isLocked) {
                vaultShare.forceApprove(address(future), growShares);
                future.lock(
                    keccak256(abi.encode(sender, plan.planId, "GROW")),
                    vaultShare,
                    plan.recipient,
                    growShares,
                    plan.unlockAt
                );
                vaultShare.forceApprove(address(future), 0);
            }
        }

        emit PlanExecuted(plan.planId, sender, plan.recipient, plan.nowAmount, plan.growAmount, growShares);
    }
}
