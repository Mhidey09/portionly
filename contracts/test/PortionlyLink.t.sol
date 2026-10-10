// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {PortionlyFuture} from "../src/PortionlyFuture.sol";
import {PortionlyLink} from "../src/PortionlyLink.sol";
import {PortionlySplitterV2} from "../src/PortionlySplitterV2.sol";
import {V2MockAUSD, V2MockInvest, V2MockVault} from "./PortionlySplitterV2.t.sol";

contract PortionlyLinkTest is Test {
    V2MockAUSD internal ausd;
    V2MockVault internal vault;
    V2MockInvest internal invest;
    PortionlyFuture internal future;
    PortionlySplitterV2 internal splitter;
    PortionlyLink internal links;

    address internal sender = makeAddr("sender");
    address internal recipient = makeAddr("recipient");
    address internal thief = makeAddr("thief");
    address internal link = makeAddr("link");

    function setUp() external {
        ausd = new V2MockAUSD();
        vault = new V2MockVault(ausd);
        invest = new V2MockInvest(ausd);
        future = new PortionlyFuture();
        splitter = new PortionlySplitterV2(ausd, address(vault), IERC20(address(vault)), address(future), invest);
        links = new PortionlyLink(ausd, splitter);
        ausd.mint(sender, 1_000e6);
        vm.prank(sender);
        ausd.approve(address(links), type(uint256).max);
    }

    function _create(uint32 lockDays) private {
        vm.prank(sender);
        links.create(link, 100e6, 60e6, 40e6, lockDays);
    }

    function test_holdsExactTotalUntilTheLinkClaims() external {
        _create(0);
        assertEq(ausd.balanceOf(address(links)), 200e6, "escrow holds the total");
        assertEq(ausd.balanceOf(sender), 800e6, "sender paid the total");
        address[] memory sent = links.sentBy(sender);
        assertEq(sent.length, 1);
        assertEq(sent[0], link);
    }

    function test_linkClaimsAllThreePortionsToARecipientItChooses() external {
        _create(0);
        vm.prank(link);
        links.claim(recipient, 1e18, block.timestamp + 10 minutes);

        assertEq(ausd.balanceOf(recipient), 100e6, "home now");
        assertEq(vault.balanceOf(recipient), 60e6, "savings shares");
        assertEq(ausd.balanceOf(address(invest)), 40e6, "stocks portion spent");
        assertEq(ausd.balanceOf(address(links)), 0, "escrow keeps nothing");
        assertEq(ausd.allowance(address(links), address(splitter)), 0, "no allowance left");
    }

    function test_lockStartsWhenClaimedNotWhenSent() external {
        _create(90);
        vm.warp(block.timestamp + 20 days);
        uint256 claimedAt = block.timestamp;
        vm.prank(link);
        links.claim(recipient, 1e18, block.timestamp + 10 minutes);

        assertEq(vault.balanceOf(recipient), 0, "locked, not delivered");
        assertEq(vault.balanceOf(address(future)), 60e6, "future holds the savings");
        bytes32 key =
            future.positionKey(address(splitter), keccak256(abi.encode(address(links), links.planIdOf(link), "GROW")));
        (,,, uint64 unlockAt,) = future.positions(key);
        assertGe(unlockAt, claimedAt + 90 days, "a full 90 days from the claim");
    }

    function test_onlyTheLinkCanClaim() external {
        _create(0);
        vm.prank(thief);
        vm.expectRevert(PortionlyLink.NothingToClaim.selector);
        links.claim(thief, 1e18, block.timestamp + 10 minutes);
    }

    function test_cannotClaimTwice() external {
        _create(0);
        vm.startPrank(link);
        links.claim(recipient, 1e18, block.timestamp + 10 minutes);
        vm.expectRevert(PortionlyLink.NothingToClaim.selector);
        links.claim(recipient, 1e18, block.timestamp + 10 minutes);
        vm.stopPrank();
    }

    function test_senderTakesItBackBeforeItIsClaimed() external {
        _create(30);
        vm.prank(thief);
        vm.expectRevert(PortionlyLink.NotTheSender.selector);
        links.cancel(link);

        vm.prank(sender);
        links.cancel(link);
        assertEq(ausd.balanceOf(sender), 1_000e6, "full refund");
        assertEq(ausd.balanceOf(address(links)), 0);

        vm.prank(link);
        vm.expectRevert(PortionlyLink.NothingToClaim.selector);
        links.claim(recipient, 1e18, block.timestamp + 10 minutes);
    }

    function test_cannotCancelAfterClaim() external {
        _create(0);
        vm.prank(link);
        links.claim(recipient, 1e18, block.timestamp + 10 minutes);
        vm.prank(sender);
        vm.expectRevert(PortionlyLink.NothingToClaim.selector);
        links.cancel(link);
    }

    function test_rejectsBadLinks() external {
        vm.startPrank(sender);
        vm.expectRevert(PortionlyLink.InvalidLink.selector);
        links.create(address(0), 1e6, 0, 0, 0);
        vm.expectRevert(PortionlyLink.EmptyAmount.selector);
        links.create(link, 0, 0, 0, 0);
        vm.expectRevert(PortionlyLink.InvalidLock.selector);
        links.create(link, 1e6, 1e6, 0, 7);
        vm.expectRevert(PortionlyLink.InvalidLock.selector);
        links.create(link, 1e6, 0, 0, 30);
        links.create(link, 1e6, 0, 0, 0);
        vm.expectRevert(PortionlyLink.LinkInUse.selector);
        links.create(link, 1e6, 0, 0, 0);
        vm.stopPrank();
    }

    function test_aStockPriceThatMovedSendsThatPortionToSavings() external {
        _create(0);
        invest.setShouldFail(true);
        vm.prank(link);
        links.claim(recipient, 1e18, block.timestamp + 10 minutes);
        assertEq(ausd.balanceOf(recipient), 100e6, "home now");
        assertEq(vault.balanceOf(recipient), 100e6, "savings got the stocks portion too");
        assertEq(ausd.balanceOf(address(links)), 0);
    }

    function test_sendHomeLinkNeedsNoStockMinimum() external {
        vm.prank(sender);
        links.create(link, 50e6, 0, 0, 0);
        vm.prank(link);
        links.claim(recipient, 0, block.timestamp + 10 minutes);
        assertEq(ausd.balanceOf(recipient), 50e6);
    }
}
