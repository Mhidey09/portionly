// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

interface IUpshiftLendingPool {
    function instantRedeem(uint256 shares, address receiver) external;
    function requestRedeem(uint256 shares, address receiver) external;
    function claim(uint256 year, uint256 month, uint256 day, address receiver) external;
    function previewRedemption(uint256 shares, bool isInstant) external view returns (uint256, uint256);
    function getWithdrawalEpoch()
        external
        view
        returns (uint256 year, uint256 month, uint256 day, uint256 claimableEpoch);
}

/// @notice Proves how a recipient turns earnAUSD back into AUSD on the live Upshift vault.
contract UpshiftRedeemForkTest is Test {
    address internal constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address internal constant VAULT = 0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA;
    address internal constant EARN_AUSD = 0x103222f020e98Bba0AD9809A011FDF8e6F067496;
    address internal constant HOLDER = 0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2;

    uint256 internal shares;

    function setUp() external {
        if (block.chainid != 143) vm.skip(true);
        shares = IERC20(EARN_AUSD).balanceOf(HOLDER);
        assertGt(shares, 0, "holder has earnAUSD");
    }

    function test_instantRedeemPaysAusdNowMinusFee() external {
        (, uint256 expected) = IUpshiftLendingPool(VAULT).previewRedemption(shares, true);
        uint256 before = IERC20(AUSD).balanceOf(HOLDER);
        vm.startPrank(HOLDER);
        IERC20(EARN_AUSD).approve(VAULT, shares);
        IUpshiftLendingPool(VAULT).instantRedeem(shares, HOLDER);
        vm.stopPrank();
        uint256 received = IERC20(AUSD).balanceOf(HOLDER) - before;
        console2.log("instant received", received, "preview after fee", expected);
        assertEq(IERC20(EARN_AUSD).balanceOf(HOLDER), 0, "shares spent");
        assertEq(received, expected, "matches preview after fee");
    }

    function test_requestRedeemThenClaimAfterLag() external {
        (uint256 y, uint256 m, uint256 d,) = IUpshiftLendingPool(VAULT).getWithdrawalEpoch();
        console2.log("claim date", y, m, d);
        uint256 before = IERC20(AUSD).balanceOf(HOLDER);
        vm.startPrank(HOLDER);
        IERC20(EARN_AUSD).approve(VAULT, shares);
        IUpshiftLendingPool(VAULT).requestRedeem(shares, HOLDER);
        assertEq(IERC20(EARN_AUSD).balanceOf(HOLDER), 0, "shares escrowed");
        vm.warp(block.timestamp + 4 days);
        IUpshiftLendingPool(VAULT).claim(y, m, d, HOLDER);
        vm.stopPrank();
        console2.log("standard received", IERC20(AUSD).balanceOf(HOLDER) - before);
        assertGt(IERC20(AUSD).balanceOf(HOLDER), before, "AUSD arrives after the lag");
    }
}
