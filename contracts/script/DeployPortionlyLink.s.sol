// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {PortionlyLink} from "../src/PortionlyLink.sol";
import {PortionlySplitterV2} from "../src/PortionlySplitterV2.sol";

contract DeployPortionlyLink is Script {
    address internal constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address internal constant SPLITTER = 0x28ac522B6224dBDAD523f3dBFa9D3a62d995dA1a;

    function run() external returns (PortionlyLink links) {
        require(block.chainid == 143, "Monad mainnet required");
        require(SPLITTER.code.length > 0, "splitter has no code");
        require(address(PortionlySplitterV2(SPLITTER).ausd()) == AUSD, "splitter asset mismatch");

        vm.startBroadcast();
        links = new PortionlyLink(IERC20(AUSD), PortionlySplitterV2(SPLITTER));
        vm.stopBroadcast();
    }
}
