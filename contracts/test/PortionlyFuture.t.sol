// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {PortionlyFuture} from "../src/PortionlyFuture.sol";

contract MockFutureAsset is ERC20 {
    constructor() ERC20("Future Asset", "FUTURE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract PortionlyFutureTest is Test {
    MockFutureAsset internal asset;
    PortionlyFuture internal future;

    address internal depositor = makeAddr("depositor");
    address internal beneficiary = makeAddr("beneficiary");

    function setUp() external {
        asset = new MockFutureAsset();
        future = new PortionlyFuture();
        asset.mint(depositor, 100e18);
        vm.prank(depositor);
        asset.approve(address(future), type(uint256).max);
    }

    function test_locksAssetForThirtyDaysThenReleasesToBeneficiary() external {
        bytes32 positionId = keccak256("october-grow");
        uint64 unlockAt = uint64(block.timestamp + 30 days);

        vm.prank(depositor);
        bytes32 key = future.lock(positionId, asset, beneficiary, 100e18, unlockAt);
        assertEq(key, future.positionKey(depositor, positionId), "key is scoped to depositor");

        assertEq(asset.balanceOf(address(future)), 100e18);
        assertEq(asset.balanceOf(beneficiary), 0);

        vm.warp(unlockAt);
        vm.prank(beneficiary);
        future.claim(key);

        assertEq(asset.balanceOf(address(future)), 0);
        assertEq(asset.balanceOf(beneficiary), 100e18);
    }

    function test_frontRunnerCannotSquatAnotherDepositorsPositionId() external {
        bytes32 positionId = keccak256("october-grow");
        uint64 unlockAt = uint64(block.timestamp + 30 days);
        address attacker = makeAddr("attacker");
        asset.mint(attacker, 1);
        vm.startPrank(attacker);
        asset.approve(address(future), 1);
        future.lock(positionId, asset, attacker, 1, unlockAt);
        vm.stopPrank();

        vm.prank(depositor);
        future.lock(positionId, asset, beneficiary, 100e18, unlockAt);
        assertEq(asset.balanceOf(address(future)), 100e18 + 1);
    }
}
