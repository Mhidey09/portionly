// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {PortionlyFuture} from "../src/PortionlyFuture.sol";
import {PortionlyLink} from "../src/PortionlyLink.sol";
import {PortionlySplitterV2} from "../src/PortionlySplitterV2.sol";
import {V2MockAUSD, V2MockInvest, V2MockVault} from "./PortionlySplitterV2.t.sol";

contract PortionlyLinkFuzzTest is Test {
    uint256 internal constant MAX_AMOUNT = 1e15;
    uint256 internal constant MOCK_INVEST_OUT = 25e18;

    V2MockAUSD internal ausd;
    V2MockVault internal vault;
    V2MockInvest internal invest;
    PortionlyFuture internal future;
    PortionlySplitterV2 internal splitter;
    PortionlyLink internal links;

    address internal sender = makeAddr("sender");
    address internal recipient = makeAddr("recipient");
    address internal link = makeAddr("link");

    struct Amounts {
        uint256 nowAmount;
        uint256 growAmount;
        uint256 investAmount;
        uint32 lockDays;
    }

    function setUp() external {
        vm.warp(1_000_000);
        ausd = new V2MockAUSD();
        vault = new V2MockVault(ausd);
        invest = new V2MockInvest(ausd);
        future = new PortionlyFuture();
        splitter = new PortionlySplitterV2(ausd, address(vault), IERC20(address(vault)), address(future), invest);
        links = new PortionlyLink(ausd, splitter);
        ausd.mint(sender, type(uint128).max);
        vm.prank(sender);
        ausd.approve(address(links), type(uint256).max);
    }

    // ---------------------------------------------------------------- helpers

    function _amounts(uint256 nowRaw, uint256 growRaw, uint256 investRaw, uint256 lockRaw, bool locked)
        private
        pure
        returns (Amounts memory a)
    {
        a.nowAmount = bound(nowRaw, 0, MAX_AMOUNT);
        a.growAmount = bound(growRaw, 0, MAX_AMOUNT);
        a.investAmount = bound(investRaw, 0, MAX_AMOUNT);
        if (locked) {
            a.lockDays = uint32(bound(lockRaw, 30, 366));
            if (a.growAmount == 0) a.growAmount = 1;
        }
        if (a.nowAmount + a.growAmount + a.investAmount == 0) a.nowAmount = 1;
    }

    function _total(Amounts memory a) private pure returns (uint256) {
        return a.nowAmount + a.growAmount + a.investAmount;
    }

    function _create(address who, address key, Amounts memory a) private {
        vm.prank(who);
        links.create(key, a.nowAmount, a.growAmount, a.investAmount, a.lockDays);
    }

    function _claim(address key, Amounts memory a) private {
        uint256 minimum = a.investAmount == 0 ? 0 : MOCK_INVEST_OUT;
        vm.prank(key);
        links.claim(recipient, minimum, block.timestamp + 10 minutes);
    }

    function _linkKey(uint256 i) private pure returns (address) {
        return address(uint160(0xA11CE000 + i));
    }

    // ------------------------------------------------------------ create + claim

    function testFuzz_createThenClaimRoutesEverythingOnce(
        uint256 nowRaw,
        uint256 growRaw,
        uint256 investRaw,
        uint256 lockRaw,
        bool locked,
        bool investFails,
        uint256 waitRaw
    ) external {
        Amounts memory a = _amounts(nowRaw, growRaw, investRaw, lockRaw, locked);
        invest.setShouldFail(investFails);
        uint256 senderBefore = ausd.balanceOf(sender);

        _create(sender, link, a);
        assertEq(ausd.balanceOf(address(links)), _total(a), "escrow holds the total");
        assertEq(senderBefore - ausd.balanceOf(sender), _total(a), "sender paid the total");

        vm.warp(block.timestamp + bound(waitRaw, 0, 400 days));
        uint256 claimedAt = block.timestamp;
        _claim(link, a);

        bool fellBack = a.investAmount != 0 && investFails;
        uint256 growTotal = a.growAmount + (fellBack ? a.investAmount : 0);
        assertEq(ausd.balanceOf(address(links)), 0, "link contract emptied");
        assertEq(ausd.allowance(address(links), address(splitter)), 0, "no allowance left");
        assertEq(ausd.balanceOf(address(splitter)), 0, "splitter empty");
        assertEq(ausd.balanceOf(recipient), a.nowAmount, "recipient got Now");
        assertEq(ausd.balanceOf(address(invest)), (a.investAmount != 0 && !investFails) ? a.investAmount : 0, "stocks");
        assertEq(ausd.balanceOf(address(vault)), growTotal, "savings deposit");
        assertEq(senderBefore - ausd.balanceOf(sender), _total(a), "sender paid only once");

        if (a.lockDays == 0) {
            assertEq(vault.balanceOf(recipient), growTotal, "liquid savings");
            assertEq(vault.balanceOf(address(future)), 0);
        } else {
            assertEq(vault.balanceOf(recipient), 0, "locked savings not liquid");
            assertEq(vault.balanceOf(address(future)), growTotal, "future holds savings");
            bytes32 key = future.positionKey(
                address(splitter), keccak256(abi.encode(address(links), links.planIdOf(link), "GROW"))
            );
            (, address beneficiary, uint256 amount, uint64 unlockAt, bool claimed) = future.positions(key);
            assertEq(beneficiary, recipient);
            assertEq(amount, growTotal);
            assertFalse(claimed);
            assertGe(unlockAt, claimedAt + uint256(a.lockDays) * 1 days, "lock counts from the claim");
            assertLe(unlockAt, claimedAt + uint256(a.lockDays) * 1 days + 1 hours, "no extra delay beyond the margin");
        }

        // The link can never pay twice, and the sender can no longer cancel.
        vm.prank(link);
        vm.expectRevert(PortionlyLink.NothingToClaim.selector);
        links.claim(recipient, a.investAmount == 0 ? 0 : MOCK_INVEST_OUT, block.timestamp + 10 minutes);
        vm.prank(sender);
        vm.expectRevert(PortionlyLink.NothingToClaim.selector);
        links.cancel(link);
        assertEq(ausd.balanceOf(address(links)), 0);
    }

    // ----------------------------------------------------------- create + cancel

    function testFuzz_createThenCancelRefundsEverythingOnce(
        uint256 nowRaw,
        uint256 growRaw,
        uint256 investRaw,
        uint256 lockRaw,
        bool locked
    ) external {
        Amounts memory a = _amounts(nowRaw, growRaw, investRaw, lockRaw, locked);
        uint256 senderBefore = ausd.balanceOf(sender);
        _create(sender, link, a);

        vm.prank(sender);
        links.cancel(link);
        assertEq(ausd.balanceOf(sender), senderBefore, "full refund");
        assertEq(ausd.balanceOf(address(links)), 0, "escrow empty");

        vm.prank(sender);
        vm.expectRevert(PortionlyLink.NothingToClaim.selector);
        links.cancel(link);

        vm.prank(link);
        vm.expectRevert(PortionlyLink.NothingToClaim.selector);
        links.claim(recipient, a.investAmount == 0 ? 0 : MOCK_INVEST_OUT, block.timestamp + 10 minutes);
        assertEq(ausd.balanceOf(sender), senderBefore, "still exactly refunded once");
        assertEq(ausd.balanceOf(recipient), 0);
    }

    function testFuzz_onlyTheSenderCanCancel(address stranger, uint256 nowRaw) external {
        vm.assume(stranger != sender);
        Amounts memory a = _amounts(nowRaw, 0, 0, 0, false);
        _create(sender, link, a);
        vm.prank(stranger);
        vm.expectRevert(PortionlyLink.NotTheSender.selector);
        links.cancel(link);
        assertEq(ausd.balanceOf(address(links)), a.nowAmount, "still escrowed");
    }

    // ------------------------------------------------------------- who can claim

    function testFuzz_onlyTheLinkKeyCanClaim(address stranger, uint256 nowRaw, uint256 growRaw, uint256 investRaw)
        external
    {
        vm.assume(stranger != link);
        Amounts memory a = _amounts(nowRaw, growRaw, investRaw, 0, false);
        _create(sender, link, a);
        uint256 strangerBefore = ausd.balanceOf(stranger);

        vm.prank(stranger);
        vm.expectRevert(PortionlyLink.NothingToClaim.selector);
        links.claim(stranger, a.investAmount == 0 ? 0 : MOCK_INVEST_OUT, block.timestamp + 10 minutes);
        assertEq(ausd.balanceOf(address(links)), _total(a), "funds stay put");
        assertEq(ausd.balanceOf(stranger), strangerBefore);
    }

    function testFuzz_claimRejectsBadRecipientsWithoutLosingTheLink(uint256 nowRaw) external {
        Amounts memory a = _amounts(nowRaw, 0, 0, 0, false);
        _create(sender, link, a);
        vm.startPrank(link);
        vm.expectRevert(PortionlyLink.InvalidRecipient.selector);
        links.claim(address(0), 0, block.timestamp + 10 minutes);
        vm.expectRevert(PortionlyLink.InvalidRecipient.selector);
        links.claim(address(links), 0, block.timestamp + 10 minutes);
        vm.stopPrank();
        assertEq(ausd.balanceOf(address(links)), a.nowAmount, "still open");
        _claim(link, a);
        assertEq(ausd.balanceOf(recipient), a.nowAmount);
    }

    // ------------------------------------------------------------- link reuse

    function testFuzz_aLinkAddressCanNeverBeReused(address otherSender, uint256 nowRaw, uint256 stage, uint256 growRaw)
        external
    {
        vm.assume(otherSender != address(0));
        Amounts memory a = _amounts(nowRaw, growRaw, 0, 0, false);
        _create(sender, link, a);

        stage = bound(stage, 0, 2);
        if (stage == 1) _claim(link, a);
        if (stage == 2) {
            vm.prank(sender);
            links.cancel(link);
        }

        ausd.mint(otherSender, _total(a));
        vm.prank(otherSender);
        ausd.approve(address(links), type(uint256).max);
        vm.prank(otherSender);
        vm.expectRevert(PortionlyLink.LinkInUse.selector);
        links.create(link, a.nowAmount, a.growAmount, 0, 0);

        vm.prank(sender);
        vm.expectRevert(PortionlyLink.LinkInUse.selector);
        links.create(link, a.nowAmount, a.growAmount, 0, 0);
    }

    function testFuzz_createRejectsInvalidLinks(uint256 nowRaw) external {
        Amounts memory a = _amounts(nowRaw, 0, 0, 0, false);
        vm.startPrank(sender);
        vm.expectRevert(PortionlyLink.InvalidLink.selector);
        links.create(address(0), a.nowAmount, 0, 0, 0);
        vm.expectRevert(PortionlyLink.InvalidLink.selector);
        links.create(address(links), a.nowAmount, 0, 0, 0);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ lock day rules

    function testFuzz_lockDaysOutsideTheAllowedSetRevert(
        uint32 lockDays,
        uint256 nowRaw,
        uint256 growRaw,
        uint256 investRaw
    ) external {
        bool allowedDays = lockDays == 0 || (lockDays >= 30 && lockDays <= 366);
        vm.assume(!allowedDays);
        Amounts memory a = _amounts(nowRaw, growRaw, investRaw, 0, false);
        a.lockDays = lockDays;
        uint256 senderBefore = ausd.balanceOf(sender);

        vm.prank(sender);
        vm.expectRevert(PortionlyLink.InvalidLock.selector);
        links.create(link, a.nowAmount, a.growAmount, a.investAmount, a.lockDays);
        assertEq(ausd.balanceOf(sender), senderBefore, "nothing taken");
    }

    function testFuzz_lockedLinkWithoutSavingsReverts(uint256 lockRaw, uint256 nowRaw, uint256 investRaw) external {
        uint32 lockDays = uint32(bound(lockRaw, 30, 366));
        uint256 nowAmount = bound(nowRaw, 0, MAX_AMOUNT);
        uint256 investAmount = bound(investRaw, 0, MAX_AMOUNT);
        if (nowAmount + investAmount == 0) nowAmount = 1;
        vm.prank(sender);
        vm.expectRevert(PortionlyLink.InvalidLock.selector);
        links.create(link, nowAmount, 0, investAmount, lockDays);
    }

    function testFuzz_emptyLinkReverts(uint32 lockDays) external {
        vm.prank(sender);
        vm.expectRevert(PortionlyLink.EmptyAmount.selector);
        links.create(link, 0, 0, 0, lockDays);
    }

    // ----------------------------------------------- escrow equals open payments

    function testFuzz_escrowAlwaysEqualsTheSumOfOpenPayments(
        uint256[3] memory nowRaw,
        uint256[3] memory growRaw,
        uint256[3] memory investRaw,
        uint8[3] memory actions,
        bool investFails
    ) external {
        invest.setShouldFail(investFails);
        Amounts[3] memory all;
        uint256 expectedOpen;
        for (uint256 i; i < 3; ++i) {
            all[i] = _amounts(nowRaw[i], growRaw[i], investRaw[i], 30 + i * 100, i == 2);
            _create(sender, _linkKey(i), all[i]);
            expectedOpen += _total(all[i]);
            assertEq(ausd.balanceOf(address(links)), expectedOpen, "after create");
        }
        for (uint256 i; i < 3; ++i) {
            uint8 action = actions[i] % 3;
            if (action == 1) {
                _claim(_linkKey(i), all[i]);
                expectedOpen -= _total(all[i]);
            } else if (action == 2) {
                vm.prank(sender);
                links.cancel(_linkKey(i));
                expectedOpen -= _total(all[i]);
            }
            assertEq(ausd.balanceOf(address(links)), expectedOpen, "after action");
            assertEq(ausd.balanceOf(address(splitter)), 0, "splitter empty");
        }
        uint256 openSum;
        for (uint256 i; i < 3; ++i) {
            (,,,,,, bool open) = links.payments(_linkKey(i));
            if (open) openSum += _total(all[i]);
        }
        assertEq(ausd.balanceOf(address(links)), openSum, "balance equals open payments");
    }

    // ------------------------------------------------- documented behaviour (not a bug)

    /// @dev Surprising but intentional: PortionlyLink.claim always sets fallbackInvestToGrow, so when the stock
    /// purchase fails on a locked link payment, the stock portion is added to the LOCKED savings.
    function test_documented_lockedLinkWithFailedStockLocksTheStockPortion() external {
        invest.setShouldFail(true);
        Amounts memory a = Amounts({nowAmount: 10e6, growAmount: 20e6, investAmount: 30e6, lockDays: 60});
        _create(sender, link, a);

        uint256 claimedAt = block.timestamp;
        _claim(link, a);

        assertEq(ausd.balanceOf(recipient), 10e6, "recipient liquid AUSD is only the Now portion");
        assertEq(vault.balanceOf(recipient), 0, "no liquid shares");
        assertEq(vault.balanceOf(address(future)), 50e6, "future holds savings plus the failed stock portion");
        bytes32 key =
            future.positionKey(address(splitter), keccak256(abi.encode(address(links), links.planIdOf(link), "GROW")));
        (, address beneficiary, uint256 amount, uint64 unlockAt,) = future.positions(key);
        assertEq(beneficiary, recipient);
        assertEq(amount, 50e6, "locked amount includes the stock portion");
        assertGe(unlockAt, claimedAt + 60 days);
        assertEq(ausd.balanceOf(address(links)), 0);
    }

    function test_documented_unlockedLinkWithFailedStockDeliversStockPortionAsLiquidShares() external {
        invest.setShouldFail(true);
        Amounts memory a = Amounts({nowAmount: 10e6, growAmount: 20e6, investAmount: 30e6, lockDays: 0});
        _create(sender, link, a);
        _claim(link, a);
        assertEq(vault.balanceOf(recipient), 50e6, "liquid shares include the stock portion");
        assertEq(vault.balanceOf(address(future)), 0);
    }
}
