// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {CoinbaseSmartWalletFactory} from "smart-wallet/src/CoinbaseSmartWalletFactory.sol";
import {CoinbaseSmartWallet} from "smart-wallet/src/CoinbaseSmartWallet.sol";

/**
 * @title DeployCreate2
 * @notice Deploys CoinbaseSmartWallet + Factory via CREATE2 for deterministic
 *         addresses across networks. Same salt + bytecode = same address on
 *         testnet and mainnet.
 *
 *         Uses the canonical CREATE2 deployer at 0x4e59b44847b379578588920cA78FbF26c0B4956C.
 *
 * Usage:
 *   source .env
 *   # Dry run:
 *   forge script script/DeployCreate2.s.sol:DeployCreate2 --rpc-url $FLOW_EVM_TESTNET_RPC
 *   # Broadcast:
 *   forge script script/DeployCreate2.s.sol:DeployCreate2 --rpc-url $FLOW_EVM_TESTNET_RPC --broadcast
 */
contract DeployCreate2 is Script {
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 constant SALT = bytes32(uint256(0xf10b1));  // "flowbi"

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Pre-compute addresses (for logging before broadcast)
        bytes memory implBytecode = type(CoinbaseSmartWallet).creationCode;
        bytes memory implPayload = abi.encodePacked(SALT, implBytecode);
        address implAddr = _computeCreate2(SALT, implBytecode);
        console.log("Expected Implementation:", implAddr);

        bytes memory factoryBytecode = abi.encodePacked(
            type(CoinbaseSmartWalletFactory).creationCode,
            abi.encode(implAddr)
        );
        address factoryAddr = _computeCreate2(SALT, factoryBytecode);
        console.log("Expected Factory:", factoryAddr);

        vm.startBroadcast(deployerKey);

        // 1. Deploy Implementation via CREATE2
        (bool ok1, bytes memory res1) = CREATE2_DEPLOYER.call(implPayload);
        require(ok1 && res1.length >= 20, "impl deploy failed");
        address impl = address(uint160(bytes20(res1)));
        console.log("Deployed Implementation:", impl);

        // 2. Deploy Factory via CREATE2
        bytes memory factoryPayload = abi.encodePacked(SALT, factoryBytecode);
        (bool ok2, bytes memory res2) = CREATE2_DEPLOYER.call(factoryPayload);
        require(ok2 && res2.length >= 20, "factory deploy failed");
        address factory = address(uint160(bytes20(res2)));
        console.log("Deployed Factory:", factory);

        vm.stopBroadcast();
    }

    function _computeCreate2(bytes32 salt, bytes memory bytecode) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            CREATE2_DEPLOYER,
            salt,
            keccak256(bytecode)
        )))));
    }
}
