// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title VerifyingPaymaster for EntryPoint v0.7
 * @notice Paymaster that sponsors gas if a trusted signer approves the UserOp.
 * Adapted from eth-infinitism/account-abstraction VerifyingPaymaster.
 */

struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

contract VerifyingPaymaster {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    address public immutable entryPoint;
    address public immutable verifyingSigner;
    address public owner;

    // paymasterAndData layout after the paymaster address (20 bytes):
    // [0:16]   paymasterVerificationGasLimit (uint128)
    // [16:32]  paymasterPostOpGasLimit (uint128)
    // [32:38]  validUntil (uint48)
    // [38:44]  validAfter (uint48)
    // [44:108] signature (65 bytes, ECDSA)
    uint256 private constant VALID_TIMESTAMP_OFFSET = 52; // 20 (addr) + 32 (gas limits)
    uint256 private constant SIGNATURE_OFFSET = 116; // 52 + 64 (validity data abi-encoded is 64 bytes)

    event Deposited(uint256 amount);
    event Staked(uint256 amount, uint32 unstakeDelay);

    modifier onlyEntryPoint() {
        require(msg.sender == entryPoint, "not entrypoint");
        _;
    }

    constructor(address _entryPoint, address _verifyingSigner, address _owner) {
        entryPoint = _entryPoint;
        verifyingSigner = _verifyingSigner;
        owner = _owner;
    }

    /**
     * @notice Compute the hash that the signer must sign to approve a UserOp.
     */
    function getHash(
        PackedUserOperation calldata userOp,
        uint48 validUntil,
        uint48 validAfter
    ) public view returns (bytes32) {
        return keccak256(abi.encode(
            userOp.sender,
            userOp.nonce,
            keccak256(userOp.initCode),
            keccak256(userOp.callData),
            userOp.accountGasLimits,
            userOp.preVerificationGas,
            userOp.gasFees,
            block.chainid,
            address(this),
            validUntil,
            validAfter
        ));
    }

    /**
     * @notice Called by EntryPoint to validate the paymaster's willingness to sponsor.
     * Verifies the off-chain signer's ECDSA signature over the UserOp hash.
     */
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 /*maxCost*/
    ) external onlyEntryPoint returns (bytes memory context, uint256 validationData) {
        // Parse validity timestamps and signature from paymasterAndData
        // Layout: address(20) || verificationGas(16) || postOpGas(16) || abi.encode(validUntil, validAfter)(64) || signature(65)
        bytes calldata pmData = userOp.paymasterAndData;

        // Offset past: 20 (address) + 16 (verificationGas) + 16 (postOpGas) = 52
        (uint48 validUntil, uint48 validAfter) = abi.decode(pmData[52:116], (uint48, uint48));
        bytes calldata signature = pmData[116:];

        // Compute the hash that was signed off-chain
        bytes32 hash = getHash(userOp, validUntil, validAfter);

        // Verify ECDSA signature (EthSignedMessage wrapping)
        address recovered = hash.toEthSignedMessageHash().recover(signature);

        if (recovered != verifyingSigner) {
            // Signature mismatch — return SIG_VALIDATION_FAILED (1)
            return ("", _packValidationData(true, validUntil, validAfter));
        }

        // Valid signature
        return ("", _packValidationData(false, validUntil, validAfter));
    }

    /**
     * @notice Called by EntryPoint after execution. No-op for this paymaster.
     */
    function postOp(
        uint8 /*mode*/,
        bytes calldata /*context*/,
        uint256 /*actualGasCost*/,
        uint256 /*actualUserOpFeePerGas*/
    ) external onlyEntryPoint {}

    /**
     * @dev Pack validation data per ERC-4337 spec:
     * validationData = (sigFailed ? 1 : 0) | (validUntil << 160) | (validAfter << 208)
     * If validUntil == 0, treat as "no expiry" (= type(uint48).max in practice, but spec says 0 = infinite)
     */
    function _packValidationData(
        bool sigFailed,
        uint48 validUntil,
        uint48 validAfter
    ) internal pure returns (uint256) {
        return (sigFailed ? 1 : 0)
            | (uint256(validUntil) << 160)
            | (uint256(validAfter) << 208);
    }

    /**
     * @notice Deposit FLOW to EntryPoint for gas sponsoring.
     */
    function deposit() external payable {
        (bool ok,) = entryPoint.call{value: msg.value}(abi.encodeWithSignature("depositTo(address)", address(this)));
        require(ok, "deposit failed");
        emit Deposited(msg.value);
    }

    /**
     * @notice Stake FLOW at EntryPoint (required for paymasters).
     */
    function addStake(uint32 unstakeDelaySec) external payable {
        require(msg.sender == owner, "only owner");
        (bool ok,) = entryPoint.call{value: msg.value}(
            abi.encodeWithSignature("addStake(uint32)", unstakeDelaySec)
        );
        require(ok, "stake failed");
        emit Staked(msg.value, unstakeDelaySec);
    }

    /**
     * @notice Withdraw deposit from EntryPoint.
     */
    function withdrawTo(address payable to, uint256 amount) external {
        require(msg.sender == owner, "only owner");
        (bool ok,) = entryPoint.call(
            abi.encodeWithSignature("withdrawTo(address,uint256)", to, amount)
        );
        require(ok, "withdraw failed");
    }

    /**
     * @notice Transfer ownership.
     */
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "only owner");
        owner = newOwner;
    }

    receive() external payable {}
}
