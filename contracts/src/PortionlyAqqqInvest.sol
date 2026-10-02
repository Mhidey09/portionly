// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IPortionlyInvest} from "./PortionlySplitterV2.sol";

interface IPermit2AllowanceTransfer {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IPortionlyUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

contract PortionlyAqqqInvest is IPortionlyInvest, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address public constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address public constant AQQQ = 0x1446501E886c7f830DB9b494A1890cBCCC072f57;
    address public constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address public constant UNIVERSAL_ROUTER = 0xa6CE4F10d83dBdDAc17E68e1837ca9cE6a1b596e;
    address private constant ROUTER_RECIPIENT = 0x0000000000000000000000000000000000000002;

    error AmountTooLarge();
    error EmptyAmount();
    error EmptyMinimum();
    error InvalidRecipient();
    error PlanExpired();
    error ReceivedBelowMinimum();

    function invest(uint256 amountIn, uint256 minimumOut, address recipient, uint256 deadline)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert EmptyAmount();
        if (minimumOut == 0) revert EmptyMinimum();
        if (recipient == address(0)) revert InvalidRecipient();
        if (deadline <= block.timestamp || deadline > type(uint48).max) revert PlanExpired();
        if (amountIn > type(uint128).max || amountIn > type(uint160).max) revert AmountTooLarge();

        uint256 beforeBalance = IERC20(AQQQ).balanceOf(recipient);
        IERC20(AUSD).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(AUSD).forceApprove(PERMIT2, amountIn);
        IPermit2AllowanceTransfer(PERMIT2).approve(AUSD, UNIVERSAL_ROUTER, uint160(amountIn), uint48(deadline));

        IPortionlyUniversalRouter(UNIVERSAL_ROUTER)
            .execute(hex"021004", _routerInputs(amountIn, minimumOut, recipient), deadline);

        IERC20(AUSD).forceApprove(PERMIT2, 0);
        amountOut = IERC20(AQQQ).balanceOf(recipient) - beforeBalance;
        if (amountOut < minimumOut) revert ReceivedBelowMinimum();
    }

    function _routerInputs(uint256 amountIn, uint256 minimumOut, address recipient)
        private
        pure
        returns (bytes[] memory inputs)
    {
        bytes memory swapAction = abi.encode(
            ExactInputParams({
                currencyIn: AUSD,
                path: _path(),
                minHopPriceX36: new uint256[](0),
                amountIn: uint128(amountIn),
                amountOutMinimum: 0
            })
        );
        bytes memory settleAction = abi.encode(AUSD, amountIn, false);
        bytes memory takeAction = abi.encode(AQQQ, ROUTER_RECIPIENT, uint256(0));
        bytes[] memory actions = new bytes[](3);
        actions[0] = swapAction;
        actions[1] = settleAction;
        actions[2] = takeAction;

        bytes[] memory v4Inputs = new bytes[](2);
        v4Inputs[0] = abi.encode(AUSD, ROUTER_RECIPIENT, uint160(amountIn));
        v4Inputs[1] = abi.encode(hex"070b0e", actions);

        inputs = new bytes[](3);
        inputs[0] = v4Inputs[0];
        inputs[1] = v4Inputs[1];
        inputs[2] = abi.encode(AQQQ, recipient, minimumOut);
    }

    function _path() private pure returns (PathKey[] memory path) {
        path = new PathKey[](2);
        path[0] = PathKey({intermediateCurrency: USDC, fee: 50, tickSpacing: 1, hooks: address(0), hookData: ""});
        path[1] = PathKey({intermediateCurrency: AQQQ, fee: 9000, tickSpacing: 90, hooks: address(0), hookData: ""});
    }

    struct ExactInputParams {
        address currencyIn;
        PathKey[] path;
        uint256[] minHopPriceX36;
        uint128 amountIn;
        uint128 amountOutMinimum;
    }

    struct PathKey {
        address intermediateCurrency;
        uint256 fee;
        int24 tickSpacing;
        address hooks;
        bytes hookData;
    }
}
