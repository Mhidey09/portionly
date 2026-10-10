// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {PortionlyLink} from "../src/PortionlyLink.sol";
import {PortionlySplitterV2} from "../src/PortionlySplitterV2.sol";

/// @notice A link payment settled through the splitter that is live on Monad mainnet.
contract PortionlyLinkForkTest is Test {
    address internal constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address internal constant AQQQ = 0x1446501E886c7f830DB9b494A1890cBCCC072f57;
    address internal constant EARN_AUSD = 0x103222f020e98Bba0AD9809A011FDF8e6F067496;
    address internal constant SPLITTER = 0x28ac522B6224dBDAD523f3dBFa9D3a62d995dA1a;
    address internal constant FUTURE = 0x816fd57253CD589B76cF24B8cA1Ba38bB7818E22;
    address internal constant AUSD_HOLDER = 0xD5b70d70CBE6C42bCD1aaa662A21673A83f4615b;

    PortionlyLink internal links;
    address internal sender = makeAddr("sender");
    address internal recipient = makeAddr("recipient");
    address internal link = makeAddr("link");

    function setUp() external {
        if (block.chainid != 143) vm.skip(true);
        links = new PortionlyLink(IERC20(AUSD), PortionlySplitterV2(SPLITTER));
        vm.prank(AUSD_HOLDER);
        IERC20(AUSD).transfer(sender, 3e6);
        vm.prank(sender);
        IERC20(AUSD).approve(address(links), 3e6);
    }

    function test_linkPaymentLandsAsThreeRealPortions() external {
        vm.prank(sender);
        links.create(link, 1e6, 1e6, 1e6, 0);

        vm.prank(link);
        uint256 gasBefore = gasleft();
        links.claim(recipient, 1, block.timestamp + 10 minutes);
        console2.log("claim gas", gasBefore - gasleft());

        assertEq(IERC20(AUSD).balanceOf(recipient), 1e6, "home now");
        assertGt(IERC20(EARN_AUSD).balanceOf(recipient), 0, "savings");
        assertGt(IERC20(AQQQ).balanceOf(recipient), 0, "stocks");
        assertEq(IERC20(AUSD).balanceOf(address(links)), 0, "escrow keeps nothing");
    }

    function test_lockedLinkPaymentHoldsSavingsForTheRecipient() external {
        vm.prank(sender);
        links.create(link, 1e6, 2e6, 0, 30);
        uint256 heldBefore = IERC20(EARN_AUSD).balanceOf(FUTURE);

        vm.prank(link);
        links.claim(recipient, 0, block.timestamp + 10 minutes);

        assertEq(IERC20(AUSD).balanceOf(recipient), 1e6, "home now");
        assertEq(IERC20(EARN_AUSD).balanceOf(recipient), 0, "savings not released early");
        assertGt(IERC20(EARN_AUSD).balanceOf(FUTURE), heldBefore, "future holds the savings");
    }

    function test_senderCancelsAndIsRefunded() external {
        vm.startPrank(sender);
        links.create(link, 1e6, 1e6, 1e6, 0);
        links.cancel(link);
        vm.stopPrank();
        assertEq(IERC20(AUSD).balanceOf(sender), 3e6, "refunded in full");
    }
}
