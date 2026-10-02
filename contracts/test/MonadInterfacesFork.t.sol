// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

interface ILiveAUSD {
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}

interface ILiveUpshiftVault {
    function asset() external view returns (address);
    function previewDeposit(address assetIn, uint256 amount) external view returns (uint256 shares);
}

interface ILiveERC20Metadata {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

interface ILiveV4Quoter {
    struct PathKey {
        address intermediateCurrency;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
        bytes hookData;
    }

    struct QuoteExactParams {
        address exactCurrency;
        PathKey[] path;
        uint128 exactAmount;
    }

    function quoteExactInput(QuoteExactParams memory params) external returns (uint256 amountOut, uint256 gasEstimate);
}

contract MonadInterfacesForkTest is Test {
    address internal constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address internal constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address internal constant AQQQ = 0x1446501E886c7f830DB9b494A1890cBCCC072f57;
    address internal constant UPSHIFT_VAULT = 0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA;
    address internal constant V4_QUOTER = 0xa222Dd357A9076d1091Ed6Aa2e16C9742dD26891;

    function setUp() external {
        if (block.chainid != 143) vm.skip(true);
    }

    function test_liveAUSDExposesAuthorizationInterfaces() external view {
        ILiveAUSD token = ILiveAUSD(AUSD);

        assertEq(token.symbol(), "AUSD");
        assertEq(token.decimals(), 6);
        assertNotEq(token.DOMAIN_SEPARATOR(), bytes32(0));
        assertFalse(token.authorizationState(address(1), bytes32(0)));
    }

    function test_liveUpshiftAcceptsAUSDAndReturnsShares() external view {
        ILiveUpshiftVault liveVault = ILiveUpshiftVault(UPSHIFT_VAULT);

        assertEq(liveVault.asset(), AUSD);
        assertGt(liveVault.previewDeposit(AUSD, 100e6), 0);
    }

    function test_liveAUSDToAQQQRouteReturnsOutput() external {
        assertEq(ILiveERC20Metadata(AQQQ).name(), "Invesco QQQ aStock");
        assertEq(ILiveERC20Metadata(AQQQ).symbol(), "aQQQ");
        assertEq(ILiveERC20Metadata(AQQQ).decimals(), 18);

        ILiveV4Quoter.PathKey[] memory path = new ILiveV4Quoter.PathKey[](2);
        path[0] = ILiveV4Quoter.PathKey({
            intermediateCurrency: USDC, fee: 50, tickSpacing: 1, hooks: address(0), hookData: ""
        });
        path[1] = ILiveV4Quoter.PathKey({
            intermediateCurrency: AQQQ, fee: 9000, tickSpacing: 90, hooks: address(0), hookData: ""
        });

        (uint256 amountOut, uint256 gasEstimate) = ILiveV4Quoter(V4_QUOTER)
            .quoteExactInput(ILiveV4Quoter.QuoteExactParams({exactCurrency: AUSD, path: path, exactAmount: 1e6}));

        assertGt(amountOut, 0, "one AUSD must quote nonzero aQQQ");
        assertGt(gasEstimate, 0, "quoter must return a gas estimate");
    }
}
