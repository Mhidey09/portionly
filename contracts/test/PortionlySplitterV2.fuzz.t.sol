// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PortionlyFuture} from "../src/PortionlyFuture.sol";
import {PortionlySplitterV2} from "../src/PortionlySplitterV2.sol";
import {V2MockAUSD, V2MockInvest, V2MockVault} from "./PortionlySplitterV2.t.sol";

contract PortionlySplitterV2FuzzTest is Test {
    uint256 internal constant MAX_AMOUNT = 1e15;
    uint256 internal constant MOCK_INVEST_OUT = 25e18;

    V2MockAUSD internal ausd;
    V2MockVault internal vault;
    V2MockInvest internal invest;
    PortionlyFuture internal future;
    PortionlySplitterV2 internal splitter;

    address internal sender = makeAddr("sender");
    address internal otherSender = makeAddr("otherSender");
    address internal recipient = makeAddr("recipient");

    struct Scenario {
        uint256 nowAmount;
        uint256 growAmount;
        uint256 investAmount;
        uint256 investMinimumOut;
        bool fallbackToGrow;
        bool investFails;
        uint64 unlockAt;
        bytes32 planId;
    }

    function setUp() external {
        vm.warp(1_000_000);
        ausd = new V2MockAUSD();
        vault = new V2MockVault(ausd);
        invest = new V2MockInvest(ausd);
        future = new PortionlyFuture();
        splitter = new PortionlySplitterV2(ausd, address(vault), vault, address(future), invest);
        vm.prank(sender);
        ausd.approve(address(splitter), type(uint256).max);
        vm.prank(otherSender);
        ausd.approve(address(splitter), type(uint256).max);
    }

    // ---------------------------------------------------------------- helpers

    function _plan(Scenario memory s) private view returns (PortionlySplitterV2.Plan memory) {
        return PortionlySplitterV2.Plan({
            recipient: recipient,
            nowAmount: s.nowAmount,
            growAmount: s.growAmount,
            investAmount: s.investAmount,
            investMinimumOut: s.investMinimumOut,
            fallbackInvestToGrow: s.fallbackToGrow,
            unlockAt: s.unlockAt,
            deadline: block.timestamp + 1 hours,
            planId: s.planId
        });
    }

    function _scenario(
        uint256 nowRaw,
        uint256 growRaw,
        uint256 investRaw,
        uint256 minRaw,
        bool fallbackToGrow,
        bool investFails,
        bool locked,
        uint256 unlockExtra
    ) private view returns (Scenario memory s) {
        s.nowAmount = bound(nowRaw, 0, MAX_AMOUNT);
        s.growAmount = bound(growRaw, 0, MAX_AMOUNT);
        s.investAmount = bound(investRaw, 0, MAX_AMOUNT);
        if (s.nowAmount + s.growAmount + s.investAmount == 0) s.nowAmount = 1;
        s.investMinimumOut = s.investAmount == 0 ? 0 : bound(minRaw, 1, MOCK_INVEST_OUT);
        s.fallbackToGrow = fallbackToGrow;
        s.investFails = investFails;
        s.unlockAt = locked ? uint64(block.timestamp + 30 days + bound(unlockExtra, 0, 3650 days)) : 0;
        s.planId = keccak256(abi.encode("fuzz-plan", nowRaw, growRaw, investRaw));
    }

    function _total(Scenario memory s) private pure returns (uint256) {
        return s.nowAmount + s.growAmount + s.investAmount;
    }

    function _fund(address who, uint256 amount) private {
        ausd.mint(who, amount + 12_345);
    }

    function _growKey(address who, bytes32 planId) private view returns (bytes32) {
        return future.positionKey(address(splitter), keccak256(abi.encode(who, planId, "GROW")));
    }

    function _assertNothingStuck() private view {
        assertEq(ausd.balanceOf(address(splitter)), 0, "splitter holds no AUSD");
        assertEq(vault.balanceOf(address(splitter)), 0, "splitter holds no shares");
        assertEq(ausd.allowance(address(splitter), address(vault)), 0, "no vault allowance");
        assertEq(ausd.allowance(address(splitter), address(invest)), 0, "no invest allowance");
        assertEq(ausd.allowance(address(splitter), address(future)), 0, "no future AUSD allowance");
        assertEq(vault.allowance(address(splitter), address(future)), 0, "no future share allowance");
    }

    // --------------------------------------------------------------- fuzz: routing

    function testFuzz_executeRoutesEveryPortionExactly(
        uint256 nowRaw,
        uint256 growRaw,
        uint256 investRaw,
        uint256 minRaw,
        bool fallbackToGrow,
        bool investFails,
        bool locked,
        uint256 unlockExtra
    ) external {
        Scenario memory s = _scenario(
            nowRaw, growRaw, investRaw, minRaw, fallbackToGrow, investFails, locked, unlockExtra
        );
        _fund(sender, _total(s));
        invest.setShouldFail(s.investFails);
        uint256 senderBefore = ausd.balanceOf(sender);

        bool investBreaks = s.investAmount != 0 && s.investFails;
        if (investBreaks && !s.fallbackToGrow) {
            _assertFailedInvestRollsBack(s, senderBefore);
            return;
        }

        vm.prank(sender);
        (uint256 growShares, uint256 investOut, bool usedFallback) = splitter.execute(_plan(s));

        uint256 growTotal = s.growAmount + (investBreaks ? s.investAmount : 0);
        uint256 investSpent = (s.investAmount != 0 && !s.investFails) ? s.investAmount : 0;

        assertEq(senderBefore - ausd.balanceOf(sender), _total(s), "sender paid exactly the total");
        assertEq(ausd.balanceOf(recipient), s.nowAmount, "recipient got exactly Now");
        assertEq(ausd.balanceOf(address(invest)), investSpent, "invest executor got exactly the invest amount");
        assertEq(ausd.balanceOf(address(vault)), growTotal, "vault got exactly the grow amount");
        assertEq(usedFallback, investBreaks, "fallback flag");
        assertEq(growShares, growTotal, "returned shares");
        assertEq(investOut, investSpent == 0 ? 0 : MOCK_INVEST_OUT, "returned invest out");
        assertTrue(splitter.planExecuted(sender, s.planId), "plan marked used");

        if (s.unlockAt != 0) {
            assertEq(vault.balanceOf(recipient), 0, "locked shares not delivered liquid");
            assertEq(vault.balanceOf(address(future)), growTotal, "future holds the grow shares");
            if (growTotal != 0) {
                (, address beneficiary, uint256 amount, uint64 unlockAt, bool claimed) =
                    future.positions(_growKey(sender, s.planId));
                assertEq(beneficiary, recipient, "position beneficiary");
                assertEq(amount, growTotal, "position amount");
                assertEq(unlockAt, s.unlockAt, "position unlock");
                assertFalse(claimed);
            }
        } else {
            assertEq(vault.balanceOf(recipient), growTotal, "liquid grow shares to recipient");
            assertEq(vault.balanceOf(address(future)), 0, "future untouched");
        }
        _assertNothingStuck();
        assertEq(
            ausd.balanceOf(sender) + ausd.balanceOf(recipient) + ausd.balanceOf(address(vault))
                + ausd.balanceOf(address(invest)),
            senderBefore,
            "AUSD conserved"
        );
    }

    function _assertFailedInvestRollsBack(Scenario memory s, uint256 senderBefore) private {
        vm.prank(sender);
        vm.expectPartialRevert(PortionlySplitterV2.InvestFailed.selector);
        splitter.execute(_plan(s));

        assertEq(ausd.balanceOf(sender), senderBefore, "sender untouched");
        assertEq(ausd.balanceOf(recipient), 0, "no Now paid");
        assertEq(ausd.balanceOf(address(vault)), 0, "no deposit");
        assertEq(ausd.balanceOf(address(invest)), 0, "no invest");
        assertEq(vault.totalSupply(), 0, "no shares minted");
        assertFalse(splitter.planExecuted(sender, s.planId), "plan not consumed");
        _assertNothingStuck();
    }

    function testFuzz_aPlanIdCannotRunTwiceForTheSameSender(uint256 nowRaw, uint256 growRaw, bytes32 planId) external {
        vm.assume(planId != bytes32(0));
        Scenario memory s = _scenario(nowRaw, growRaw, 0, 0, false, false, false, 0);
        s.planId = planId;
        _fund(sender, _total(s) * 2);

        vm.startPrank(sender);
        splitter.execute(_plan(s));
        vm.expectRevert(PortionlySplitterV2.PlanAlreadyUsed.selector);
        splitter.execute(_plan(s));
        vm.stopPrank();
        assertEq(ausd.balanceOf(recipient), s.nowAmount, "paid once");
    }

    function testFuzz_planIdsAreScopedPerSender(uint256 nowRaw, bytes32 planId) external {
        vm.assume(planId != bytes32(0));
        Scenario memory s = _scenario(nowRaw, 0, 0, 0, false, false, false, 0);
        s.planId = planId;
        _fund(sender, _total(s));
        _fund(otherSender, _total(s));

        vm.prank(sender);
        splitter.execute(_plan(s));
        vm.prank(otherSender);
        splitter.execute(_plan(s));
        assertEq(ausd.balanceOf(recipient), s.nowAmount * 2, "both senders paid");
    }

    function testFuzz_lockedPlansUseOnePositionPerSenderAndPlan(uint256 growRaw, bytes32 planId) external {
        vm.assume(planId != bytes32(0));
        Scenario memory s = _scenario(0, growRaw, 0, 0, false, false, true, 0);
        s.growAmount = bound(growRaw, 1, MAX_AMOUNT);
        s.planId = planId;
        _fund(sender, s.growAmount);
        _fund(otherSender, s.growAmount);

        vm.prank(sender);
        splitter.execute(_plan(s));
        vm.prank(otherSender);
        splitter.execute(_plan(s));

        assertTrue(_growKey(sender, planId) != _growKey(otherSender, planId), "keys differ per sender");
        assertEq(vault.balanceOf(address(future)), s.growAmount * 2, "both locked");
    }

    function testFuzz_lockedPlanWithUnlockUnderThirtyDaysRevertsWhenThereIsSavings(uint256 growRaw, uint256 soon)
        external
    {
        Scenario memory s = _scenario(0, growRaw, 0, 0, false, false, false, 0);
        s.growAmount = bound(growRaw, 1, MAX_AMOUNT);
        s.unlockAt = uint64(bound(soon, 1, block.timestamp + 30 days - 1));
        _fund(sender, s.growAmount);
        uint256 balanceBefore = ausd.balanceOf(sender);

        vm.prank(sender);
        vm.expectRevert(PortionlyFuture.LockTooShort.selector);
        splitter.execute(_plan(s));
        assertEq(ausd.balanceOf(sender), balanceBefore, "nothing moved");
        assertEq(vault.totalSupply(), 0, "nothing deposited");
    }

    // --------------------------------------------------------- fuzz: invalid plans

    function testFuzz_revertsOnZeroRecipient(uint256 nowRaw) external {
        Scenario memory s = _scenario(nowRaw, 0, 0, 0, false, false, false, 0);
        _fund(sender, _total(s));
        PortionlySplitterV2.Plan memory plan = _plan(s);
        plan.recipient = address(0);
        vm.prank(sender);
        vm.expectRevert(PortionlySplitterV2.InvalidRecipient.selector);
        splitter.execute(plan);
    }

    function testFuzz_revertsOnZeroPlanId(uint256 nowRaw) external {
        Scenario memory s = _scenario(nowRaw, 0, 0, 0, false, false, false, 0);
        _fund(sender, _total(s));
        s.planId = bytes32(0);
        vm.prank(sender);
        vm.expectRevert(PortionlySplitterV2.EmptyPlanId.selector);
        splitter.execute(_plan(s));
    }

    function testFuzz_revertsWhenDeadlinePassed(uint256 nowRaw, uint256 lateBy) external {
        Scenario memory s = _scenario(nowRaw, 0, 0, 0, false, false, false, 0);
        _fund(sender, _total(s));
        PortionlySplitterV2.Plan memory plan = _plan(s);
        plan.deadline = block.timestamp - bound(lateBy, 1, block.timestamp);
        vm.prank(sender);
        vm.expectRevert(PortionlySplitterV2.PlanExpired.selector);
        splitter.execute(plan);
    }

    function testFuzz_deadlineEqualToNowStillExecutes(uint256 nowRaw) external {
        Scenario memory s = _scenario(nowRaw, 0, 0, 0, false, false, false, 0);
        _fund(sender, _total(s));
        PortionlySplitterV2.Plan memory plan = _plan(s);
        plan.deadline = block.timestamp;
        vm.prank(sender);
        splitter.execute(plan);
        assertEq(ausd.balanceOf(recipient), s.nowAmount);
    }

    function testFuzz_revertsOnInvestAmountWithoutMinimum(uint256 nowRaw, uint256 investRaw) external {
        Scenario memory s = _scenario(nowRaw, 0, investRaw, 0, true, false, false, 0);
        s.investAmount = bound(investRaw, 1, MAX_AMOUNT);
        s.investMinimumOut = 0;
        _fund(sender, _total(s));
        vm.prank(sender);
        vm.expectRevert(PortionlySplitterV2.InvalidInvestPlan.selector);
        splitter.execute(_plan(s));
    }

    function testFuzz_revertsOnMinimumWithoutInvestAmount(uint256 nowRaw, uint256 minRaw) external {
        Scenario memory s = _scenario(nowRaw, 0, 0, 0, true, false, false, 0);
        s.investAmount = 0;
        s.investMinimumOut = bound(minRaw, 1, type(uint128).max);
        _fund(sender, _total(s));
        vm.prank(sender);
        vm.expectRevert(PortionlySplitterV2.InvalidInvestPlan.selector);
        splitter.execute(_plan(s));
    }

    function testFuzz_revertsOnEmptyPlan(bool fallbackToGrow, uint256 unlockExtra) external {
        Scenario memory s;
        s.fallbackToGrow = fallbackToGrow;
        s.unlockAt = uint64(block.timestamp + 30 days + bound(unlockExtra, 0, 3650 days));
        s.planId = keccak256("empty");
        vm.prank(sender);
        vm.expectRevert(PortionlySplitterV2.EmptyPlan.selector);
        splitter.execute(_plan(s));
    }

    function testFuzz_revertsWhenSenderCannotCoverTheTotal(uint256 nowRaw, uint256 shortBy) external {
        Scenario memory s = _scenario(nowRaw, 0, 0, 0, false, false, false, 0);
        ausd.mint(sender, s.nowAmount - bound(shortBy, 1, s.nowAmount));
        vm.prank(sender);
        vm.expectRevert();
        splitter.execute(_plan(s));
        assertFalse(splitter.planExecuted(sender, s.planId), "plan not consumed");
    }

    // ------------------------------------------------- documented behaviour (not a bug)

    /// @dev Surprising but intentional: when the stock buy fails, fallbackInvestToGrow is true and the plan is
    /// locked, the stock portion is added to the LOCKED savings. The recipient does not receive it liquid.
    function test_documented_failedInvestWithFallbackAndLockLocksTheInvestAmount() external {
        invest.setShouldFail(true);
        ausd.mint(sender, 60e6);
        PortionlySplitterV2.Plan memory plan = PortionlySplitterV2.Plan({
            recipient: recipient,
            nowAmount: 10e6,
            growAmount: 20e6,
            investAmount: 30e6,
            investMinimumOut: 1e18,
            fallbackInvestToGrow: true,
            unlockAt: uint64(block.timestamp + 90 days),
            deadline: block.timestamp + 1 hours,
            planId: keccak256("locked-fallback")
        });

        vm.prank(sender);
        (uint256 growShares, uint256 investOut, bool usedFallback) = splitter.execute(plan);

        assertTrue(usedFallback);
        assertEq(investOut, 0);
        assertEq(growShares, 50e6, "grow plus invest were deposited together");
        assertEq(ausd.balanceOf(recipient), 10e6, "recipient liquid AUSD is only the Now portion");
        assertEq(vault.balanceOf(recipient), 0, "no liquid shares for the recipient");
        assertEq(vault.balanceOf(address(future)), 50e6, "future holds Grow plus the failed Invest");
        (, address beneficiary, uint256 amount, uint64 unlockAt,) = future.positions(_growKey(sender, plan.planId));
        assertEq(beneficiary, recipient);
        assertEq(amount, 50e6, "locked position includes the invest amount");
        assertEq(unlockAt, plan.unlockAt);
    }

    function test_documented_failedInvestWithFallbackAndNoLockDeliversInvestAsLiquidShares() external {
        invest.setShouldFail(true);
        ausd.mint(sender, 60e6);
        PortionlySplitterV2.Plan memory plan = PortionlySplitterV2.Plan({
            recipient: recipient,
            nowAmount: 10e6,
            growAmount: 20e6,
            investAmount: 30e6,
            investMinimumOut: 1e18,
            fallbackInvestToGrow: true,
            unlockAt: 0,
            deadline: block.timestamp + 1 hours,
            planId: keccak256("unlocked-fallback")
        });
        vm.prank(sender);
        splitter.execute(plan);
        assertEq(vault.balanceOf(recipient), 50e6, "liquid shares include the invest amount");
        assertEq(vault.balanceOf(address(future)), 0);
    }

    function test_investMinimumAboveWhatTheExecutorReturnsRevertsAsInvestFailed() external {
        ausd.mint(sender, 10e6);
        PortionlySplitterV2.Plan memory plan = PortionlySplitterV2.Plan({
            recipient: recipient,
            nowAmount: 0,
            growAmount: 0,
            investAmount: 10e6,
            investMinimumOut: MOCK_INVEST_OUT + 1,
            fallbackInvestToGrow: false,
            unlockAt: 0,
            deadline: block.timestamp + 1 hours,
            planId: keccak256("too-high")
        });
        vm.prank(sender);
        vm.expectPartialRevert(PortionlySplitterV2.InvestFailed.selector);
        splitter.execute(plan);
        assertEq(ausd.balanceOf(sender), 10e6);
    }
}
