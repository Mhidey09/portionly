// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {PortionlyFuture} from "../src/PortionlyFuture.sol";
import {PortionlyAqqqInvest} from "../src/PortionlyAqqqInvest.sol";
import {PortionlySplitterV2} from "../src/PortionlySplitterV2.sol";

interface IAssetVault {
    function asset() external view returns (address);
}

contract DeployPortionly is Script {
    address internal constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address internal constant UPSHIFT_AUSD_VAULT = 0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA;

    function run() external returns (PortionlyAqqqInvest invest, PortionlyFuture future, PortionlySplitterV2 splitter) {
        require(block.chainid == 143, "Monad mainnet required");
        require(AUSD.code.length > 0, "AUSD has no code");
        require(UPSHIFT_AUSD_VAULT.code.length > 0, "Upshift vault has no code");
        require(IAssetVault(UPSHIFT_AUSD_VAULT).asset() == AUSD, "vault asset mismatch");

        vm.startBroadcast();
        invest = new PortionlyAqqqInvest();
        future = new PortionlyFuture();
        splitter = new PortionlySplitterV2(
            IERC20(AUSD), UPSHIFT_AUSD_VAULT, IERC20(UPSHIFT_AUSD_VAULT), address(future), invest
        );
        vm.stopBroadcast();
    }
}
