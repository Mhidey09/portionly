// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {PortionlySplitter} from "../src/PortionlySplitter.sol";
import {PortionlyFuture} from "../src/PortionlyFuture.sol";

contract MockAUSD is ERC20 {
    mapping(bytes32 => bool) public authorizationState;

    constructor() ERC20("Agora Dollar", "AUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
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

contract MockUpshiftVault is ERC20 {
    IERC20 public immutable assetToken;

    constructor(IERC20 asset_) ERC20("Earn AUSD", "earnAUSD") {
        assetToken = asset_;
    }

    function deposit(address asset, uint256 amount, address receiver) external returns (uint256 mintedShares) {
        require(asset == address(assetToken), "wrong asset");
        assetToken.transferFrom(msg.sender, address(this), amount);
        mintedShares = amount;
        _mint(receiver, mintedShares);
    }
}

contract PortionlySplitterTest is Test {
    MockAUSD internal ausd;
    MockUpshiftVault internal vault;
    PortionlyFuture internal future;
    PortionlySplitter internal splitter;

    address internal sender = makeAddr("sender");
    address internal recipient = makeAddr("recipient");

    function setUp() external {
        ausd = new MockAUSD();
        vault = new MockUpshiftVault(ausd);
        future = new PortionlyFuture();
        splitter = new PortionlySplitter(ausd, address(vault), vault, address(future));

        ausd.mint(sender, 400e6);
        vm.prank(sender);
        ausd.approve(address(splitter), type(uint256).max);
    }

    function test_routesNowAndGrowDirectlyToRecipientWithoutRetainingFunds() external {
        PortionlySplitter.Plan memory plan = PortionlySplitter.Plan({
            recipient: recipient,
            nowAmount: 240e6,
            growAmount: 160e6,
            unlockAt: 0,
            deadline: block.timestamp + 1 hours,
            planId: keccak256("family-october")
        });

        vm.prank(sender);
        splitter.execute(plan);

        assertEq(ausd.balanceOf(recipient), 240e6, "recipient Now balance");
        assertEq(vault.balanceOf(recipient), 160e6, "recipient owns Grow shares");
        assertEq(vault.balanceOf(address(future)), 0, "Future is unused without a lock");
        assertEq(ausd.balanceOf(address(splitter)), 0, "splitter must not retain AUSD");
        assertEq(ausd.balanceOf(address(vault)), 160e6, "vault received Grow assets");
    }

    function test_relayerExecutesWithOneAUSDAuthorization() external {
        PortionlySplitter.Plan memory plan = PortionlySplitter.Plan({
            recipient: recipient,
            nowAmount: 300e6,
            growAmount: 100e6,
            unlockAt: uint64(block.timestamp + 30 days),
            deadline: block.timestamp + 1 hours,
            planId: keccak256("gasless-family-plan")
        });
        bytes32 nonce = splitter.authorizationNonce(sender, plan);

        vm.prank(makeAddr("relayer"));
        splitter.executeWithAuthorization(
            sender, plan, 0, block.timestamp + 1 hours, nonce, 27, bytes32(uint256(1)), bytes32(uint256(2))
        );

        assertEq(ausd.balanceOf(recipient), 300e6, "recipient Now balance");
        assertEq(vault.balanceOf(address(future)), 100e6, "Future holds locked Grow shares");
        assertTrue(ausd.authorizationState(nonce), "authorization consumed");
        assertEq(ausd.balanceOf(address(splitter)), 0, "splitter must not retain AUSD");
    }

    function test_relayerCannotChangeAPlanCoveredByAnAuthorization() external {
        PortionlySplitter.Plan memory signedPlan = PortionlySplitter.Plan({
            recipient: recipient,
            nowAmount: 300e6,
            growAmount: 100e6,
            unlockAt: uint64(block.timestamp + 30 days),
            deadline: block.timestamp + 1 hours,
            planId: keccak256("bound-family-plan")
        });
        bytes32 nonce = splitter.authorizationNonce(sender, signedPlan);

        PortionlySplitter.Plan memory tamperedPlan = signedPlan;
        tamperedPlan.recipient = makeAddr("attacker");

        vm.expectRevert(PortionlySplitter.AuthorizationPlanMismatch.selector);
        splitter.executeWithAuthorization(
            sender, tamperedPlan, 0, block.timestamp + 1 hours, nonce, 27, bytes32(uint256(1)), bytes32(uint256(2))
        );
    }

    function test_rejectsReplayOfTheSameSenderPlan() external {
        PortionlySplitter.Plan memory plan = PortionlySplitter.Plan({
            recipient: recipient,
            nowAmount: 240e6,
            growAmount: 160e6,
            unlockAt: uint64(block.timestamp + 30 days),
            deadline: block.timestamp + 1 hours,
            planId: keccak256("one-time-family-plan")
        });

        vm.prank(sender);
        splitter.execute(plan);

        ausd.mint(sender, 400e6);
        vm.prank(sender);
        vm.expectRevert(PortionlySplitter.PlanAlreadyUsed.selector);
        splitter.execute(plan);
    }
}
