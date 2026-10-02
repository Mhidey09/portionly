// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IPortionlyFuture, IUpshiftVault} from "./PortionlySplitter.sol";

interface IPortionlyInvest {
    function invest(uint256 amountIn, uint256 minimumOut, address recipient, uint256 deadline)
        external
        returns (uint256 amountOut);
}

contract PortionlySplitterV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Plan {
        address recipient;
        uint256 nowAmount;
        uint256 growAmount;
        uint256 investAmount;
        uint256 investMinimumOut;
        bool fallbackInvestToGrow;
        uint64 unlockAt;
        uint256 deadline;
        bytes32 planId;
    }

    IERC20 public immutable ausd;
    IUpshiftVault public immutable vault;
    IERC20 public immutable vaultShare;
    IPortionlyFuture public immutable future;
    IPortionlyInvest public immutable investExecutor;
    mapping(address sender => mapping(bytes32 planId => bool executed)) public planExecuted;

    error EmptyPlan();
    error EmptyPlanId();
    error GrowProducedNoShares();
    error InvalidConfiguration();
    error InvalidInvestPlan();
    error InvalidRecipient();
    error InvestBelowMinimum();
    error InvestFailed(bytes reason);
    error PlanAlreadyUsed();
    error PlanExpired();

    event PlanExecuted(
        bytes32 indexed planId,
        address indexed sender,
        address indexed recipient,
        uint256 nowAmount,
        uint256 growAmount,
        uint256 growShares,
        uint256 investAmount,
        uint256 investOut,
        bool usedFallback
    );

    constructor(IERC20 ausd_, address vault_, IERC20 vaultShare_, address future_, IPortionlyInvest investExecutor_) {
        if (
            address(ausd_) == address(0) || vault_ == address(0) || address(vaultShare_) == address(0)
                || future_ == address(0) || address(investExecutor_) == address(0)
        ) revert InvalidConfiguration();
        ausd = ausd_;
        vault = IUpshiftVault(vault_);
        vaultShare = vaultShare_;
        future = IPortionlyFuture(future_);
        investExecutor = investExecutor_;
    }

    function execute(Plan calldata plan)
        external
        nonReentrant
        returns (uint256 growShares, uint256 investOut, bool usedFallback)
    {
        uint256 total = _validatePlan(plan);
        _consumePlan(msg.sender, plan.planId);
        ausd.safeTransferFrom(msg.sender, address(this), total);
        return _route(msg.sender, plan);
    }

    function _validatePlan(Plan calldata plan) private view returns (uint256 total) {
        if (plan.recipient == address(0)) revert InvalidRecipient();
        if (plan.planId == bytes32(0)) revert EmptyPlanId();
        if (block.timestamp > plan.deadline) revert PlanExpired();
        if (plan.investAmount != 0 && plan.investMinimumOut == 0) revert InvalidInvestPlan();
        if (plan.investAmount == 0 && plan.investMinimumOut != 0) revert InvalidInvestPlan();

        total = plan.nowAmount + plan.growAmount + plan.investAmount;
        if (total == 0) revert EmptyPlan();
    }

    function _consumePlan(address sender, bytes32 planId) private {
        if (planExecuted[sender][planId]) revert PlanAlreadyUsed();
        planExecuted[sender][planId] = true;
    }

    function _route(address sender, Plan calldata plan)
        private
        returns (uint256 growShares, uint256 investOut, bool usedFallback)
    {
        if (plan.nowAmount != 0) ausd.safeTransfer(plan.recipient, plan.nowAmount);

        uint256 growAmount = plan.growAmount;
        if (plan.investAmount != 0) {
            ausd.forceApprove(address(investExecutor), plan.investAmount);
            try investExecutor.invest(plan.investAmount, plan.investMinimumOut, plan.recipient, plan.deadline) returns (
                uint256 amountOut
            ) {
                investOut = amountOut;
            } catch (bytes memory reason) {
                if (!plan.fallbackInvestToGrow) revert InvestFailed(reason);
                growAmount += plan.investAmount;
                usedFallback = true;
            }
            ausd.forceApprove(address(investExecutor), 0);
            if (!usedFallback && investOut < plan.investMinimumOut) revert InvestBelowMinimum();
        }

        if (growAmount != 0) {
            bool isLocked = plan.unlockAt != 0;
            address shareReceiver = isLocked ? address(this) : plan.recipient;
            ausd.forceApprove(address(vault), growAmount);
            growShares = vault.deposit(address(ausd), growAmount, shareReceiver);
            if (growShares == 0) revert GrowProducedNoShares();
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

        emit PlanExecuted(
            plan.planId,
            sender,
            plan.recipient,
            plan.nowAmount,
            growAmount,
            growShares,
            plan.investAmount,
            investOut,
            usedFallback
        );
    }
}
