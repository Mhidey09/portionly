// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {PortionlyAqqqInvest} from "../src/PortionlyAqqqInvest.sol";

contract PortionlyAqqqInvestForkTest is Test {
    address internal constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address internal constant AQQQ = 0x1446501E886c7f830DB9b494A1890cBCCC072f57;
    address internal constant AUSD_HOLDER = 0xD5b70d70CBE6C42bCD1aaa662A21673A83f4615b;

    PortionlyAqqqInvest internal executor;
    address internal sender = makeAddr("sender");
    address internal recipient = makeAddr("recipient");

    function setUp() external {
        if (block.chainid != 143) vm.skip(true);
        executor = new PortionlyAqqqInvest();
        vm.prank(AUSD_HOLDER);
        IERC20(AUSD).transfer(sender, 1e6);
        vm.prank(sender);
        IERC20(AUSD).approve(address(executor), 1e6);
    }

    function test_swapsExactAUSDToRecipientAqqqOnDeployedRouter() external {
        uint256 beforeAqqq = IERC20(AQQQ).balanceOf(recipient);

        vm.prank(sender);
        uint256 amountOut = executor.invest(1e6, 1, recipient, block.timestamp + 10 minutes);

        assertGt(amountOut, 0, "must return aQQQ output");
        assertEq(IERC20(AQQQ).balanceOf(recipient) - beforeAqqq, amountOut, "recipient output");
        assertEq(IERC20(AUSD).balanceOf(address(executor)), 0, "executor retains no AUSD");
    }
}
