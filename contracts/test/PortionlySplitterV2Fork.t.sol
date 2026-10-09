// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {PortionlyAqqqInvest} from "../src/PortionlyAqqqInvest.sol";
import {PortionlyFuture} from "../src/PortionlyFuture.sol";
import {PortionlySplitterV2} from "../src/PortionlySplitterV2.sol";

interface ILiveUpshiftVault {
    function lpTokenAddress() external view returns (address);
}

/// @notice Full Now + Grow + Invest plan against the deployed Monad AUSD, Upshift vault and aQQQ route.
contract PortionlySplitterV2ForkTest is Test {
    address internal constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address internal constant AQQQ = 0x1446501E886c7f830DB9b494A1890cBCCC072f57;
    address internal constant UPSHIFT_VAULT = 0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA;
    address internal constant EARN_AUSD = 0x103222f020e98Bba0AD9809A011FDF8e6F067496;
    address internal constant AUSD_HOLDER = 0xD5b70d70CBE6C42bCD1aaa662A21673A83f4615b;

    PortionlyFuture internal future;
    PortionlySplitterV2 internal splitter;
    address internal sender = makeAddr("sender");
    address internal recipient = makeAddr("recipient");

    function setUp() external {
        if (block.chainid != 143) vm.skip(true);
        assertEq(ILiveUpshiftVault(UPSHIFT_VAULT).lpTokenAddress(), EARN_AUSD, "vault share token");

        future = new PortionlyFuture();
        splitter = new PortionlySplitterV2(
            IERC20(AUSD), UPSHIFT_VAULT, IERC20(EARN_AUSD), address(future), new PortionlyAqqqInvest()
        );
        vm.prank(AUSD_HOLDER);
        IERC20(AUSD).transfer(sender, 3e6);
        vm.prank(sender);
        IERC20(AUSD).approve(address(splitter), 3e6);
    }

    function test_routesAllThreeBucketsToRecipient() external {
        uint256 senderBefore = IERC20(AUSD).balanceOf(sender);

        vm.prank(sender);
        (uint256 growShares, uint256 investOut, bool usedFallback) = splitter.execute(_plan(0, "all-three"));

        assertFalse(usedFallback, "invest route used");
        assertEq(senderBefore - IERC20(AUSD).balanceOf(sender), 3e6, "sender spends exact total");
        assertEq(IERC20(AUSD).balanceOf(recipient), 1e6, "now bucket");
        assertGt(growShares, 0, "grow shares minted");
        assertEq(IERC20(EARN_AUSD).balanceOf(recipient), growShares, "recipient holds earnAUSD");
        assertGt(investOut, 0, "aQQQ bought");
        assertEq(IERC20(AQQQ).balanceOf(recipient), investOut, "recipient holds aQQQ");
        _assertSplitterEmpty();
    }

    function test_locksGrowSharesInFuture() external {
        uint64 unlockAt = uint64(block.timestamp + 31 days);

        vm.prank(sender);
        (uint256 growShares,,) = splitter.execute(_plan(unlockAt, "locked"));

        assertEq(IERC20(EARN_AUSD).balanceOf(recipient), 0, "shares not released early");
        assertEq(IERC20(EARN_AUSD).balanceOf(address(future)), growShares, "future holds shares");
        _assertSplitterEmpty();

        bytes32 positionId =
            future.positionKey(address(splitter), keccak256(abi.encode(sender, bytes32("locked"), "GROW")));
        vm.warp(unlockAt);
        vm.prank(recipient);
        future.claim(positionId);
        assertEq(IERC20(EARN_AUSD).balanceOf(recipient), growShares, "claimed after unlock");
    }

    function _plan(uint64 unlockAt, bytes32 planId) private view returns (PortionlySplitterV2.Plan memory) {
        return PortionlySplitterV2.Plan({
            recipient: recipient,
            nowAmount: 1e6,
            growAmount: 1e6,
            investAmount: 1e6,
            investMinimumOut: 1,
            fallbackInvestToGrow: true,
            unlockAt: unlockAt,
            deadline: block.timestamp + 10 minutes,
            planId: planId
        });
    }

    function _assertSplitterEmpty() private view {
        assertEq(IERC20(AUSD).balanceOf(address(splitter)), 0, "splitter keeps no AUSD");
        assertEq(IERC20(EARN_AUSD).balanceOf(address(splitter)), 0, "splitter keeps no shares");
    }
}
