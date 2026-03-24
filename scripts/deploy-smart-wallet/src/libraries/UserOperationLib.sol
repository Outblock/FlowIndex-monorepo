// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import {PackedUserOperation} from "../interfaces/PackedUserOperation.sol";

library UserOperationLib {
    function encode(PackedUserOperation calldata userOp) internal pure returns (bytes memory) {
        return abi.encode(
            userOp.sender,
            userOp.nonce,
            keccak256(userOp.initCode),
            keccak256(userOp.callData),
            userOp.accountGasLimits,
            userOp.preVerificationGas,
            userOp.gasFees,
            keccak256(userOp.paymasterAndData)
        );
    }

    function hash(PackedUserOperation calldata userOp) internal pure returns (bytes32) {
        return keccak256(encode(userOp));
    }
}
