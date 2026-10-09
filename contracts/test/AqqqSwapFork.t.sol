// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPermit2AllowanceTransfer {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

interface IAqqqQuoter {
    struct PathKey {
        address intermediateCurrency;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
        bytes hookData;
    }

    struct QuoteExactParams {
        address exactCurrency;
        PathKey[] path;
        uint128 exactAmount;
    }

    function quoteExactInput(QuoteExactParams memory params) external returns (uint256 amountOut, uint256 gasEstimate);
}

contract AqqqSwapForkTest is Test {
    address internal constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address internal constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address internal constant AQQQ = 0x1446501E886c7f830DB9b494A1890cBCCC072f57;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address internal constant UNIVERSAL_ROUTER = 0xa6CE4F10d83dBdDAc17E68e1837ca9cE6a1b596e;
    address internal constant V4_QUOTER = 0xa222Dd357A9076d1091Ed6Aa2e16C9742dD26891;
    address internal constant AUSD_HOLDER = 0xD5b70d70CBE6C42bCD1aaa662A21673A83f4615b;

    address internal swapper;

    function setUp() external {
        if (block.chainid != 143) vm.skip(true);
        swapper = makeAddr("mera-swapper");
    }

    function test_executesOneAUSDToAQQQThroughDeployedRouter() external {
        uint128 amountIn = 1e6;
        IAqqqQuoter.PathKey[] memory path = _path();
        (uint256 quotedOut,) = IAqqqQuoter(V4_QUOTER)
            .quoteExactInput(IAqqqQuoter.QuoteExactParams({exactCurrency: AUSD, path: path, exactAmount: amountIn}));
        uint256 minimumOut = quotedOut * 99 / 100;

        vm.prank(AUSD_HOLDER);
        IERC20(AUSD).transfer(swapper, amountIn);
        assertEq(IERC20(AUSD).balanceOf(swapper), amountIn, "fixture must fund exact AUSD input");

        vm.startPrank(swapper);
        IERC20(AUSD).approve(PERMIT2, amountIn);
        IPermit2AllowanceTransfer(PERMIT2)
            .approve(AUSD, UNIVERSAL_ROUTER, amountIn, uint48(block.timestamp + 10 minutes));

        string memory fixture = vm.readFile("test/fixtures/aqqq-swap.json");
        bytes memory routerCalldata = vm.parseJsonBytes(fixture, ".calldata");
        // The recorded SWEEP minimum is pinned to the capture-time price; bind it to today's quote instead.
        assembly ("memory-safe") {
            mstore(add(routerCalldata, mload(routerCalldata)), minimumOut)
        }
        (bool success, bytes memory result) = UNIVERSAL_ROUTER.call(routerCalldata);
        if (!success) {
            assembly ("memory-safe") {
                revert(add(result, 32), mload(result))
            }
        }
        vm.stopPrank();

        assertEq(IERC20(AUSD).balanceOf(swapper), 0, "exact input AUSD must be spent");
        assertGe(IERC20(AQQQ).balanceOf(swapper), minimumOut, "swapper must receive aQQQ");
    }

    function _path() private pure returns (IAqqqQuoter.PathKey[] memory path) {
        path = new IAqqqQuoter.PathKey[](2);
        path[0] =
            IAqqqQuoter.PathKey({intermediateCurrency: USDC, fee: 50, tickSpacing: 1, hooks: address(0), hookData: ""});
        path[1] = IAqqqQuoter.PathKey({
            intermediateCurrency: AQQQ, fee: 9000, tickSpacing: 90, hooks: address(0), hookData: ""
        });
    }
}
