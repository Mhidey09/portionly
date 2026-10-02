// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {PortionlyFuture} from "../src/PortionlyFuture.sol";
import {PortionlySplitterV2, IPortionlyInvest} from "../src/PortionlySplitterV2.sol";

contract V2MockAUSD is ERC20 {
    mapping(bytes32 => bool) public authorizationState;

    constructor() ERC20("Agora Dollar", "AUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256,
        uint256,
        bytes32 nonce,
        uint8,
        bytes32,
        bytes32
    ) external {
        require(!authorizationState[nonce], "authorization used");
        authorizationState[nonce] = true;
        _transfer(from, to, value);
    }
}

contract V2MockVault is ERC20 {
    IERC20 public immutable assetToken;
    bool public returnZeroShares;

    constructor(IERC20 asset_) ERC20("Earn AUSD", "earnAUSD") {
        assetToken = asset_;
    }

    function setReturnZeroShares(bool value) external {
        returnZeroShares = value;
    }

    function deposit(address asset, uint256 amount, address receiver) external returns (uint256 shares) {
        require(asset == address(assetToken), "wrong asset");
        assetToken.transferFrom(msg.sender, address(this), amount);
        if (returnZeroShares) return 0;
        shares = amount;
        _mint(receiver, shares);
    }
}

contract V2MockInvest is IPortionlyInvest {
    IERC20 public immutable asset;
    bool public shouldFail;
    uint256 public amountOut = 25e18;

    constructor(IERC20 asset_) {
        asset = asset_;
    }

    function setShouldFail(bool value) external {
        shouldFail = value;
    }

    function invest(uint256 amountIn, uint256 minimumOut, address, uint256) external returns (uint256) {
        require(!shouldFail, "quote moved");
        require(amountOut >= minimumOut, "below minimum");
        asset.transferFrom(msg.sender, address(this), amountIn);
        return amountOut;
    }
}

contract PortionlySplitterV2Test is Test {
    V2MockAUSD internal ausd;
    V2MockVault internal vault;
    V2MockInvest internal invest;
    PortionlyFuture internal future;
    PortionlySplitterV2 internal splitter;

    address internal sender = makeAddr("sender");
    address internal recipient = makeAddr("recipient");

    function setUp() external {
        ausd = new V2MockAUSD();
        vault = new V2MockVault(ausd);
        invest = new V2MockInvest(ausd);
        future = new PortionlyFuture();
        splitter = new PortionlySplitterV2(ausd, address(vault), vault, address(future), invest);
        ausd.mint(sender, 100e6);
        vm.prank(sender);
        ausd.approve(address(splitter), type(uint256).max);
    }

    function test_routesNowGrowAndInvestInOnePlan() external {
        PortionlySplitterV2.Plan memory plan = PortionlySplitterV2.Plan({
            recipient: recipient,
            nowAmount: 50e6,
            growAmount: 30e6,
            investAmount: 20e6,
            investMinimumOut: 24e18,
            fallbackInvestToGrow: true,
            unlockAt: 0,
            deadline: block.timestamp + 1 hours,
            planId: keccak256("complete-plan")
        });

        vm.prank(sender);
        (uint256 growShares, uint256 investOut, bool usedFallback) = splitter.execute(plan);

        assertEq(ausd.balanceOf(recipient), 50e6, "Now AUSD");
        assertEq(vault.balanceOf(recipient), 30e6, "recipient Grow shares");
        assertEq(ausd.balanceOf(address(invest)), 20e6, "Invest consumed exact AUSD");
        assertEq(growShares, 30e6);
        assertEq(investOut, 25e18);
        assertFalse(usedFallback);
        assertEq(ausd.balanceOf(address(splitter)), 0, "Splitter retains no AUSD");
    }

    function test_fallsBackFailedInvestIntoGrowWhenSignedPlanAllowsIt() external {
        invest.setShouldFail(true);
        PortionlySplitterV2.Plan memory plan = PortionlySplitterV2.Plan({
            recipient: recipient,
            nowAmount: 50e6,
            growAmount: 30e6,
            investAmount: 20e6,
            investMinimumOut: 24e18,
            fallbackInvestToGrow: true,
            unlockAt: 0,
            deadline: block.timestamp + 1 hours,
            planId: keccak256("fallback-plan")
        });

        vm.prank(sender);
        (uint256 growShares, uint256 investOut, bool usedFallback) = splitter.execute(plan);

        assertEq(ausd.balanceOf(recipient), 50e6, "Now AUSD");
        assertEq(vault.balanceOf(recipient), 50e6, "Grow includes failed Invest");
        assertEq(ausd.balanceOf(address(invest)), 0, "failed Invest consumes no AUSD");
        assertEq(growShares, 50e6);
        assertEq(investOut, 0);
        assertTrue(usedFallback);
        assertEq(ausd.balanceOf(address(splitter)), 0, "Splitter retains no AUSD");
    }

    function test_revertsFailedInvestWhenFallbackWasNotSigned() external {
        invest.setShouldFail(true);
        PortionlySplitterV2.Plan memory plan = PortionlySplitterV2.Plan({
            recipient: recipient,
            nowAmount: 50e6,
            growAmount: 30e6,
            investAmount: 20e6,
            investMinimumOut: 24e18,
            fallbackInvestToGrow: false,
            unlockAt: 0,
            deadline: block.timestamp + 1 hours,
            planId: keccak256("no-fallback-plan")
        });

        vm.prank(sender);
        vm.expectPartialRevert(PortionlySplitterV2.InvestFailed.selector);
        splitter.execute(plan);

        assertEq(ausd.balanceOf(sender), 100e6, "sender funds rollback");
        assertEq(ausd.balanceOf(recipient), 0, "no partial Now payment");
        assertEq(vault.balanceOf(recipient), 0, "no partial Grow deposit");
        assertEq(ausd.balanceOf(address(splitter)), 0, "Splitter retains no AUSD");
    }

    function test_revertsAndRollsBackWhenGrowProducesZeroShares() external {
        vault.setReturnZeroShares(true);
        PortionlySplitterV2.Plan memory plan = PortionlySplitterV2.Plan({
            recipient: recipient,
            nowAmount: 50e6,
            growAmount: 50e6,
            investAmount: 0,
            investMinimumOut: 0,
            fallbackInvestToGrow: false,
            unlockAt: 0,
            deadline: block.timestamp + 1 hours,
            planId: keccak256("zero-grow-shares")
        });

        vm.prank(sender);
        vm.expectRevert(bytes4(keccak256("GrowProducedNoShares()")));
        splitter.execute(plan);

        assertEq(ausd.balanceOf(sender), 100e6, "sender funds rollback");
        assertEq(ausd.balanceOf(recipient), 0, "no partial Now payment");
        assertEq(ausd.balanceOf(address(vault)), 0, "vault transfer rollback");
        assertEq(ausd.balanceOf(address(splitter)), 0, "Splitter retains no AUSD");
    }
}
