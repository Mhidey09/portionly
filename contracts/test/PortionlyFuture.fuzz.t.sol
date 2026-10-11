// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {PortionlyFuture} from "../src/PortionlyFuture.sol";
import {MockFutureAsset} from "./PortionlyFuture.t.sol";

contract PortionlyFutureFuzzTest is Test {
    uint256 internal constant MAX_AMOUNT = 1e30;
    uint256 internal constant MIN_LOCK = 30 days;

    MockFutureAsset internal asset;
    PortionlyFuture internal future;

    address internal depositor = makeAddr("depositor");
    address internal otherDepositor = makeAddr("otherDepositor");
    address internal beneficiary = makeAddr("beneficiary");
    address internal otherBeneficiary = makeAddr("otherBeneficiary");

    function setUp() external {
        vm.warp(1_000_000);
        asset = new MockFutureAsset();
        future = new PortionlyFuture();
        _prepare(depositor);
        _prepare(otherDepositor);
    }

    function _prepare(address who) private {
        asset.mint(who, type(uint128).max);
        vm.prank(who);
        asset.approve(address(future), type(uint256).max);
    }

    function _lock(address who, bytes32 positionId, address to, uint256 amount, uint256 unlockAt)
        private
        returns (bytes32 key)
    {
        vm.prank(who);
        key = future.lock(positionId, asset, to, amount, uint64(unlockAt));
    }

    // --------------------------------------------------------------- lock rules

    function testFuzz_lockRevertsBelowTheThirtyDayMinimum(uint256 amountRaw, uint256 shortBy, bytes32 positionId)
        external
    {
        uint256 amount = bound(amountRaw, 1, MAX_AMOUNT);
        uint256 unlockAt = block.timestamp + MIN_LOCK - bound(shortBy, 1, block.timestamp + MIN_LOCK);
        vm.prank(depositor);
        vm.expectRevert(PortionlyFuture.LockTooShort.selector);
        future.lock(positionId, asset, beneficiary, amount, uint64(unlockAt));
        assertEq(asset.balanceOf(address(future)), 0, "nothing taken");
    }

    function testFuzz_lockAcceptsAnyUnlockAtOrAfterTheMinimum(uint256 amountRaw, uint256 extra, bytes32 positionId)
        external
    {
        uint256 amount = bound(amountRaw, 1, MAX_AMOUNT);
        uint256 unlockAt = block.timestamp + MIN_LOCK + bound(extra, 0, 100 * 365 days);
        bytes32 key = _lock(depositor, positionId, beneficiary, amount, unlockAt);

        assertEq(key, future.positionKey(depositor, positionId));
        (, address storedBeneficiary, uint256 storedAmount, uint64 storedUnlock, bool claimed) = future.positions(key);
        assertEq(storedBeneficiary, beneficiary);
        assertEq(storedAmount, amount);
        assertEq(storedUnlock, unlockAt);
        assertFalse(claimed);
        assertEq(asset.balanceOf(address(future)), amount);
    }

    function testFuzz_lockRejectsZeroAmountAndZeroBeneficiary(bytes32 positionId, uint256 extra) external {
        uint256 unlockAt = block.timestamp + MIN_LOCK + bound(extra, 0, 365 days);
        vm.startPrank(depositor);
        vm.expectRevert(PortionlyFuture.EmptyPosition.selector);
        future.lock(positionId, asset, beneficiary, 0, uint64(unlockAt));
        vm.expectRevert(PortionlyFuture.InvalidBeneficiary.selector);
        future.lock(positionId, asset, address(0), 1, uint64(unlockAt));
        vm.stopPrank();
    }

    function testFuzz_sameDepositorCannotReuseAPositionId(bytes32 positionId, uint256 a, uint256 b) external {
        uint256 unlockAt = block.timestamp + MIN_LOCK;
        _lock(depositor, positionId, beneficiary, bound(a, 1, MAX_AMOUNT), unlockAt);
        vm.prank(depositor);
        vm.expectRevert(PortionlyFuture.PositionExists.selector);
        future.lock(positionId, asset, otherBeneficiary, bound(b, 1, MAX_AMOUNT), uint64(unlockAt));
    }

    function testFuzz_twoDepositorsUsingTheSamePositionIdNeverCollide(
        bytes32 positionId,
        uint256 amountA,
        uint256 amountB,
        uint256 extra
    ) external {
        amountA = bound(amountA, 1, MAX_AMOUNT);
        amountB = bound(amountB, 1, MAX_AMOUNT);
        uint256 unlockAt = block.timestamp + MIN_LOCK + bound(extra, 0, 365 days);

        bytes32 keyA = _lock(depositor, positionId, beneficiary, amountA, unlockAt);
        bytes32 keyB = _lock(otherDepositor, positionId, otherBeneficiary, amountB, unlockAt + 1 days);

        assertTrue(keyA != keyB, "keys differ");
        _assertPosition(keyA, beneficiary, amountA, unlockAt);
        _assertPosition(keyB, otherBeneficiary, amountB, unlockAt + 1 days);
        assertEq(asset.balanceOf(address(future)), amountA + amountB);

        vm.warp(unlockAt + 1 days);
        vm.prank(beneficiary);
        future.claim(keyA);
        assertEq(asset.balanceOf(beneficiary), amountA, "A paid");
        assertEq(asset.balanceOf(address(future)), amountB, "B untouched");
        vm.prank(otherBeneficiary);
        future.claim(keyB);
        assertEq(asset.balanceOf(otherBeneficiary), amountB, "B paid");
        assertEq(asset.balanceOf(address(future)), 0);
    }

    function _assertPosition(bytes32 key, address expectedBeneficiary, uint256 expectedAmount, uint256 expectedUnlock)
        private
        view
    {
        (, address ben, uint256 amt, uint64 unl, bool claimed) = future.positions(key);
        assertEq(ben, expectedBeneficiary);
        assertEq(amt, expectedAmount);
        assertEq(unl, expectedUnlock);
        assertFalse(claimed);
    }

    // -------------------------------------------------------------- claim rules

    function testFuzz_claimRevertsBeforeUnlockAt(uint256 amountRaw, uint256 extra, uint256 earlyBy, bytes32 positionId)
        external
    {
        uint256 amount = bound(amountRaw, 1, MAX_AMOUNT);
        uint256 unlockAt = block.timestamp + MIN_LOCK + bound(extra, 0, 365 days);
        bytes32 key = _lock(depositor, positionId, beneficiary, amount, unlockAt);

        vm.warp(unlockAt - bound(earlyBy, 1, unlockAt - block.timestamp));
        vm.prank(beneficiary);
        vm.expectRevert(PortionlyFuture.UnlockPending.selector);
        future.claim(key);
        assertEq(asset.balanceOf(address(future)), amount, "still locked");
    }

    function testFuzz_onlyTheBeneficiaryCanClaim(
        address caller,
        uint256 amountRaw,
        uint256 extra,
        uint256 lateBy,
        bytes32 positionId
    ) external {
        vm.assume(caller != beneficiary);
        uint256 amount = bound(amountRaw, 1, MAX_AMOUNT);
        uint256 unlockAt = block.timestamp + MIN_LOCK + bound(extra, 0, 365 days);
        bytes32 key = _lock(depositor, positionId, beneficiary, amount, unlockAt);

        vm.warp(unlockAt + bound(lateBy, 0, 365 days));
        vm.prank(caller);
        vm.expectRevert(PortionlyFuture.Unauthorized.selector);
        future.claim(key);
        assertEq(asset.balanceOf(address(future)), amount, "nothing left");
    }

    function testFuzz_depositorIsNotTheBeneficiaryUnlessNamed(uint256 amountRaw, bytes32 positionId) external {
        uint256 amount = bound(amountRaw, 1, MAX_AMOUNT);
        bytes32 key = _lock(depositor, positionId, beneficiary, amount, block.timestamp + MIN_LOCK);
        vm.warp(block.timestamp + MIN_LOCK);
        vm.prank(depositor);
        vm.expectRevert(PortionlyFuture.Unauthorized.selector);
        future.claim(key);
    }

    function testFuzz_claimPaysExactlyTheLockedAmountOnceAndNeverTwice(
        uint256 amountRaw,
        uint256 extra,
        uint256 lateBy,
        bytes32 positionId
    ) external {
        uint256 amount = bound(amountRaw, 1, MAX_AMOUNT);
        uint256 unlockAt = block.timestamp + MIN_LOCK + bound(extra, 0, 365 days);
        bytes32 key = _lock(depositor, positionId, beneficiary, amount, unlockAt);
        // A second, unrelated position that must stay untouched.
        _lock(otherDepositor, positionId, otherBeneficiary, 777, unlockAt);

        vm.warp(unlockAt + bound(lateBy, 0, 365 days));
        vm.startPrank(beneficiary);
        future.claim(key);
        assertEq(asset.balanceOf(beneficiary), amount, "paid exactly the locked amount");
        assertEq(asset.balanceOf(address(future)), 777, "only the other position remains");

        vm.expectRevert(PortionlyFuture.AlreadyClaimed.selector);
        future.claim(key);
        vm.stopPrank();
        assertEq(asset.balanceOf(beneficiary), amount, "no second payout");
    }

    function testFuzz_claimOfAnUnknownKeyReverts(bytes32 key, address caller) external {
        vm.assume(caller != address(0));
        vm.prank(caller);
        vm.expectRevert(PortionlyFuture.Unauthorized.selector);
        future.claim(key);
    }

    /// @dev An unknown key has beneficiary address(0), so the Unauthorized check passes for a caller of
    /// address(0); the call still reverts (no token to transfer). Nobody can send from address(0), so harmless.
    function test_documented_claimOfAnUnknownKeyFromAddressZeroFailsOnTheTransfer() external {
        vm.prank(address(0));
        vm.expectPartialRevert(SafeERC20.SafeERC20FailedOperation.selector);
        future.claim(bytes32(uint256(1)));
    }

    function testFuzz_claimAtExactlyUnlockAtSucceeds(uint256 amountRaw, uint256 extra, bytes32 positionId) external {
        uint256 amount = bound(amountRaw, 1, MAX_AMOUNT);
        uint256 unlockAt = block.timestamp + MIN_LOCK + bound(extra, 0, 365 days);
        bytes32 key = _lock(depositor, positionId, beneficiary, amount, unlockAt);
        vm.warp(unlockAt);
        vm.prank(beneficiary);
        future.claim(key);
        assertEq(asset.balanceOf(beneficiary), amount);
    }

    // ------------------------------------------------------------ conservation

    function testFuzz_contractBalanceAlwaysEqualsUnclaimedPositions(
        uint256[4] memory amounts,
        uint256[4] memory extras,
        uint8 claimMask,
        uint256 lateBy
    ) external {
        bytes32[4] memory keys;
        address[4] memory owners = [beneficiary, otherBeneficiary, beneficiary, otherBeneficiary];
        uint256 expected;
        uint256 latest;
        for (uint256 i; i < 4; ++i) {
            amounts[i] = bound(amounts[i], 1, MAX_AMOUNT);
            uint256 unlockAt = block.timestamp + MIN_LOCK + bound(extras[i], 0, 365 days);
            if (unlockAt > latest) latest = unlockAt;
            keys[i] =
                _lock(i % 2 == 0 ? depositor : otherDepositor, bytes32(uint256(i)), owners[i], amounts[i], unlockAt);
            expected += amounts[i];
            assertEq(asset.balanceOf(address(future)), expected, "after lock");
        }

        vm.warp(latest + bound(lateBy, 0, 365 days));
        for (uint256 i; i < 4; ++i) {
            if (claimMask & (1 << i) == 0) continue;
            vm.prank(owners[i]);
            future.claim(keys[i]);
            expected -= amounts[i];
            assertEq(asset.balanceOf(address(future)), expected, "after claim");
        }
    }
}
