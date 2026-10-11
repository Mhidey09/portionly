// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {PortionlyFuture} from "../src/PortionlyFuture.sol";
import {PortionlyLink} from "../src/PortionlyLink.sol";
import {PortionlySplitterV2} from "../src/PortionlySplitterV2.sol";
import {V2MockAUSD, V2MockInvest, V2MockVault} from "./PortionlySplitterV2.t.sol";

/// @notice Drives the whole Portionly stack with random but mostly valid calls and tracks ghost totals.
contract PortionlyHandler is Test {
    uint256 internal constant MAX_AMOUNT = 1e12;
    uint256 internal constant MOCK_INVEST_OUT = 25e18;

    V2MockAUSD public ausd;
    V2MockVault public vault;
    V2MockInvest public invest;
    PortionlyFuture public future;
    PortionlySplitterV2 public splitter;
    PortionlyLink public links;

    address[] public actors;
    address[] public holders;
    address[] public linkKeys;
    bytes32[] public futureKeys;

    uint256 public ghostMinted;
    uint256 public ghostOpenLinks;
    uint256 public ghostFutureShares;
    uint256 public ghostInvested;
    uint256 internal nonce;

    mapping(bytes32 name => uint256) public okCalls;
    mapping(bytes32 name => uint256) public failedCalls;
    uint256 public fallbackCount;
    uint256 public lockedCount;

    constructor(
        V2MockAUSD ausd_,
        V2MockVault vault_,
        V2MockInvest invest_,
        PortionlyFuture future_,
        PortionlySplitterV2 splitter_,
        PortionlyLink links_
    ) {
        ausd = ausd_;
        vault = vault_;
        invest = invest_;
        future = future_;
        splitter = splitter_;
        links = links_;

        for (uint256 i; i < 3; ++i) {
            address actor = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(actor);
            holders.push(actor);
            vm.startPrank(actor);
            ausd.approve(address(splitter), type(uint256).max);
            ausd.approve(address(links), type(uint256).max);
            vault.approve(address(future), type(uint256).max);
            vm.stopPrank();
        }
        holders.push(makeAddr("friendA"));
        holders.push(makeAddr("friendB"));
    }

    // ------------------------------------------------------------------ views

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function holderCount() external view returns (uint256) {
        return holders.length;
    }

    function linkCount() external view returns (uint256) {
        return linkKeys.length;
    }

    function futureKeyCount() external view returns (uint256) {
        return futureKeys.length;
    }

    // ---------------------------------------------------------------- helpers

    function _actor(uint256 seed) private view returns (address) {
        return actors[seed % actors.length];
    }

    function _holder(uint256 seed) private view returns (address) {
        return holders[seed % holders.length];
    }

    function _fund(address who, uint256 amount) private {
        uint256 balance = ausd.balanceOf(who);
        if (balance < amount) {
            ausd.mint(who, amount - balance);
            ghostMinted += amount - balance;
        }
    }

    function _ok(bytes32 name) private {
        okCalls[name]++;
    }

    function _bad(bytes32 name) private {
        failedCalls[name]++;
    }

    function _trackLockedPosition(bytes32 key) private {
        (IERC20 positionAsset,, uint256 amount,,) = future.positions(key);
        if (address(positionAsset) == address(0)) return;
        futureKeys.push(key);
        ghostFutureShares += amount;
        lockedCount++;
    }

    function _investHeld() private view returns (uint256) {
        return ausd.balanceOf(address(invest));
    }

    // ---------------------------------------------------------------- actions

    function warp(uint256 seed) external {
        vm.warp(block.timestamp + bound(seed, 1, 45 days));
        _ok("warp");
    }

    function execute(uint256 actorSeed, uint256 recipientSeed, uint256[4] memory raw, uint8 flags, uint256 unlockExtra)
        external
    {
        address actor = _actor(actorSeed);
        PortionlySplitterV2.Plan memory plan = PortionlySplitterV2.Plan({
            recipient: _holder(recipientSeed),
            nowAmount: bound(raw[0], 0, MAX_AMOUNT),
            growAmount: bound(raw[1], 0, MAX_AMOUNT),
            investAmount: bound(raw[2], 0, MAX_AMOUNT),
            investMinimumOut: 0,
            fallbackInvestToGrow: flags & 1 != 0,
            unlockAt: flags & 2 != 0 ? uint64(block.timestamp + 30 days + bound(unlockExtra, 0, 400 days)) : 0,
            deadline: block.timestamp + 1 hours,
            planId: keccak256(abi.encode("handler-plan", ++nonce))
        });
        if (plan.nowAmount + plan.growAmount + plan.investAmount == 0) plan.nowAmount = 1;
        if (plan.investAmount != 0) plan.investMinimumOut = bound(raw[3], 1, MOCK_INVEST_OUT);
        invest.setShouldFail(flags & 4 != 0);

        _fund(actor, plan.nowAmount + plan.growAmount + plan.investAmount);
        uint256 investBefore = _investHeld();

        vm.prank(actor);
        try splitter.execute(plan) returns (uint256, uint256, bool usedFallback) {
            _ok("execute");
            if (usedFallback) fallbackCount++;
            ghostInvested += _investHeld() - investBefore;
            if (plan.unlockAt != 0) {
                _trackLockedPosition(
                    future.positionKey(address(splitter), keccak256(abi.encode(actor, plan.planId, "GROW")))
                );
            }
        } catch {
            _bad("execute");
        }
    }

    function createLink(
        uint256 actorSeed,
        uint256 linkSeed,
        uint256 nowRaw,
        uint256 growRaw,
        uint256 investRaw,
        uint256 lockSeed
    ) external {
        address actor = _actor(actorSeed);
        address key;
        if (linkKeys.length != 0 && linkSeed % 10 == 0) {
            key = linkKeys[linkSeed / 10 % linkKeys.length];
        } else {
            key = address(uint160(0xB0B000 + ++nonce));
        }
        uint256 nowAmount = bound(nowRaw, 0, MAX_AMOUNT);
        uint256 growAmount = bound(growRaw, 0, MAX_AMOUNT);
        uint256 investAmount = bound(investRaw, 0, MAX_AMOUNT);
        uint32 lockDays = lockSeed % 3 == 0 ? 0 : uint32(bound(lockSeed, 30, 366));
        if (lockDays != 0 && growAmount == 0) growAmount = 1;
        if (nowAmount + growAmount + investAmount == 0) nowAmount = 1;
        _fund(actor, nowAmount + growAmount + investAmount);

        bool isNew = _isNewLink(key);
        vm.prank(actor);
        try links.create(key, nowAmount, growAmount, investAmount, lockDays) {
            _ok("createLink");
            ghostOpenLinks += nowAmount + growAmount + investAmount;
            if (isNew) linkKeys.push(key);
        } catch {
            _bad("createLink");
        }
    }

    /// @dev Starts at `seed` and returns the first link still open; falls back to `seed` when none is open.
    /// One call in six keeps the raw pick so closed links get exercised too.
    function _pickLink(uint256 seed) private view returns (address) {
        uint256 count = linkKeys.length;
        if (seed % 6 == 0) return linkKeys[(seed / 6) % count];
        for (uint256 i; i < count; ++i) {
            address key = linkKeys[(seed % count + i) % count];
            (,,,,,, bool open) = links.payments(key);
            if (open) return key;
        }
        return linkKeys[seed % count];
    }

    function _pickPosition(uint256 seed) private view returns (bytes32) {
        uint256 count = futureKeys.length;
        if (seed % 6 == 0) return futureKeys[(seed / 6) % count];
        for (uint256 i; i < count; ++i) {
            bytes32 key = futureKeys[(seed % count + i) % count];
            (,,,, bool claimed) = future.positions(key);
            if (!claimed) return key;
        }
        return futureKeys[seed % count];
    }

    function _isNewLink(address key) private view returns (bool) {
        (address linkSender,,,,,,) = links.payments(key);
        return linkSender == address(0);
    }

    function claimLink(uint256 linkSeed, uint256 recipientSeed, bool investFails) external {
        if (linkKeys.length == 0) return;
        address key = _pickLink(linkSeed);
        (, uint256 nowAmount, uint256 growAmount, uint256 investAmount,,, bool open) = links.payments(key);
        invest.setShouldFail(investFails);
        uint256 investBefore = _investHeld();
        uint256 minimum = investAmount == 0 ? 0 : MOCK_INVEST_OUT;

        vm.prank(key);
        try links.claim(_holder(recipientSeed), minimum, block.timestamp + 1 hours) {
            _ok("claimLink");
            ghostOpenLinks -= nowAmount + growAmount + investAmount;
            ghostInvested += _investHeld() - investBefore;
            bytes32 positionKey = future.positionKey(
                address(splitter), keccak256(abi.encode(address(links), links.planIdOf(key), "GROW"))
            );
            _trackLockedPosition(positionKey);
        } catch {
            // A claim on a closed link is the only expected revert.
            _bad("claimLink");
            assertFalse(open, "claim on an open link must not fail");
        }
    }

    function cancelLink(uint256 linkSeed, uint256 callerSeed) external {
        if (linkKeys.length == 0) return;
        address key = _pickLink(linkSeed);
        (address linkSender, uint256 nowAmount, uint256 growAmount, uint256 investAmount,,,) = links.payments(key);
        address caller = callerSeed % 5 == 0 ? _actor(callerSeed) : linkSender;

        vm.prank(caller);
        try links.cancel(key) {
            _ok("cancelLink");
            ghostOpenLinks -= nowAmount + growAmount + investAmount;
        } catch {
            _bad("cancelLink");
        }
    }

    function lockShares(uint256 actorSeed, uint256 recipientSeed, uint256 amountSeed, uint256 extra) external {
        address actor = _actor(actorSeed);
        uint256 balance = vault.balanceOf(actor);
        if (balance == 0) return;
        uint256 amount = bound(amountSeed, 1, balance);
        bytes32 positionId = keccak256(abi.encode("handler-lock", ++nonce));
        uint64 unlockAt = uint64(block.timestamp + 30 days + bound(extra, 0, 400 days));

        vm.prank(actor);
        try future.lock(positionId, vault, _holder(recipientSeed), amount, unlockAt) returns (bytes32 key) {
            _ok("lockShares");
            futureKeys.push(key);
            ghostFutureShares += amount;
        } catch {
            _bad("lockShares");
        }
    }

    function claimFuture(uint256 keySeed, uint256 waitSeed) external {
        if (futureKeys.length == 0) return;
        bytes32 key = _pickPosition(keySeed);
        (, address beneficiary, uint256 amount, uint64 unlockAt, bool claimed) = future.positions(key);
        // Usually wait until the position is claimable, sometimes try too early.
        if (waitSeed % 4 != 0 && block.timestamp < unlockAt) vm.warp(unlockAt);
        address caller = waitSeed % 7 == 0 ? _actor(waitSeed) : beneficiary;

        vm.prank(caller);
        try future.claim(key) {
            _ok("claimFuture");
            ghostFutureShares -= amount;
            assertFalse(claimed, "claimed twice");
        } catch {
            _bad("claimFuture");
        }
    }

    // -------------------------------------------------------------- summaries

    function totalOk() external view returns (uint256) {
        return okCalls["execute"] + okCalls["createLink"] + okCalls["claimLink"] + okCalls["cancelLink"]
            + okCalls["lockShares"] + okCalls["claimFuture"];
    }
}

contract PortionlyInvariantsTest is Test {
    V2MockAUSD internal ausd;
    V2MockVault internal vault;
    V2MockInvest internal invest;
    PortionlyFuture internal future;
    PortionlySplitterV2 internal splitter;
    PortionlyLink internal links;
    PortionlyHandler internal handler;

    function setUp() external {
        vm.warp(1_000_000);
        ausd = new V2MockAUSD();
        vault = new V2MockVault(ausd);
        invest = new V2MockInvest(ausd);
        future = new PortionlyFuture();
        splitter = new PortionlySplitterV2(ausd, address(vault), IERC20(address(vault)), address(future), invest);
        links = new PortionlyLink(ausd, splitter);
        handler = new PortionlyHandler(ausd, vault, invest, future, splitter, links);

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = PortionlyHandler.warp.selector;
        selectors[1] = PortionlyHandler.execute.selector;
        selectors[2] = PortionlyHandler.createLink.selector;
        selectors[3] = PortionlyHandler.claimLink.selector;
        selectors[4] = PortionlyHandler.cancelLink.selector;
        selectors[5] = PortionlyHandler.lockShares.selector;
        selectors[6] = PortionlyHandler.claimFuture.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_splitterNeverHoldsAusdOrShares() external view {
        assertEq(ausd.balanceOf(address(splitter)), 0, "splitter AUSD");
        assertEq(vault.balanceOf(address(splitter)), 0, "splitter shares");
    }

    function invariant_linkBalanceEqualsOpenPayments() external view {
        uint256 openSum;
        for (uint256 i; i < handler.linkCount(); ++i) {
            (, uint256 nowAmount, uint256 growAmount, uint256 investAmount,,, bool open) =
                links.payments(handler.linkKeys(i));
            if (open) openSum += nowAmount + growAmount + investAmount;
        }
        assertEq(ausd.balanceOf(address(links)), openSum, "balance vs payments");
        assertEq(ausd.balanceOf(address(links)), handler.ghostOpenLinks(), "balance vs ghost");
    }

    function invariant_futureSharesEqualUnclaimedPositions() external view {
        uint256 unclaimed;
        for (uint256 i; i < handler.futureKeyCount(); ++i) {
            (,, uint256 amount,, bool claimed) = future.positions(handler.futureKeys(i));
            if (!claimed) unclaimed += amount;
        }
        assertEq(vault.balanceOf(address(future)), unclaimed, "future shares vs positions");
        assertEq(vault.balanceOf(address(future)), handler.ghostFutureShares(), "future shares vs ghost");
        assertEq(ausd.balanceOf(address(future)), 0, "future holds no AUSD");
    }

    function invariant_ausdIsConservedAndNothingIsMintedByPortionly() external view {
        uint256 held;
        for (uint256 i; i < handler.holderCount(); ++i) {
            held += ausd.balanceOf(handler.holders(i));
        }
        held += ausd.balanceOf(address(links)) + ausd.balanceOf(address(splitter)) + ausd.balanceOf(address(future))
        + ausd.balanceOf(address(vault)) + ausd.balanceOf(address(invest));

        assertEq(held, handler.ghostMinted(), "every minted unit sits with an actor, contract or sink");
        assertEq(ausd.totalSupply(), handler.ghostMinted(), "supply only changes when the test mints");
        assertEq(ausd.balanceOf(address(invest)), handler.ghostInvested(), "stock sink matches");
        assertEq(ausd.balanceOf(address(vault)), vault.totalSupply(), "vault backs every share one to one");

        uint256 shares;
        for (uint256 i; i < handler.holderCount(); ++i) {
            shares += vault.balanceOf(handler.holders(i));
        }
        shares += vault.balanceOf(address(future)) + vault.balanceOf(address(links))
        + vault.balanceOf(address(splitter));
        assertEq(shares, vault.totalSupply(), "no shares lost");
    }

    function invariant_noAllowanceIsLeftOpen() external view {
        assertEq(ausd.allowance(address(splitter), address(vault)), 0, "splitter to vault");
        assertEq(ausd.allowance(address(splitter), address(invest)), 0, "splitter to invest");
        assertEq(ausd.allowance(address(splitter), address(future)), 0, "splitter to future AUSD");
        assertEq(vault.allowance(address(splitter), address(future)), 0, "splitter to future shares");
        assertEq(ausd.allowance(address(links), address(splitter)), 0, "links to splitter");
    }

    function invariant_callSummary() external view {
        console2.log("execute ok/failed", handler.okCalls("execute"), handler.failedCalls("execute"));
        console2.log("createLink ok/failed", handler.okCalls("createLink"), handler.failedCalls("createLink"));
        console2.log("claimLink ok/failed", handler.okCalls("claimLink"), handler.failedCalls("claimLink"));
        console2.log("cancelLink ok/failed", handler.okCalls("cancelLink"), handler.failedCalls("cancelLink"));
        console2.log("lockShares ok/failed", handler.okCalls("lockShares"), handler.failedCalls("lockShares"));
        console2.log("claimFuture ok/failed", handler.okCalls("claimFuture"), handler.failedCalls("claimFuture"));
        console2.log("warps", handler.okCalls("warp"));
        console2.log("invest fallbacks used", handler.fallbackCount());
        console2.log("locked positions opened", handler.lockedCount());
        console2.log("links created / future keys", handler.linkCount(), handler.futureKeyCount());
    }
}
