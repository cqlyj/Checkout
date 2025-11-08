// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IVerifier} from "./interfaces/IVerifier.sol";
import {IRegistry} from "./interfaces/IRegistry.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";

/// Intent:
/// 0: Register / Recover, Transfer
/// 1 2 3... : For future features

contract Delegation {
    using SafeERC20 for IERC20;
    IVerifier public verifier;
    IRegistry public registry;

    event Agree(uint256 indexed wallet, uint256 credential_hash, uint256 nonce);

    error Delegation__InvalidCredentials();
    error Delegation__NonceAlreadyUsed();
    error Delegation__InvalidProof();
    error Delegation__NotEnoughBalance();
    error Delegation__InsufficientAllowance();
    error Delegation__TokenTransferFailed();
    error Delegation__InvalidSender();

    constructor(address verifierAddress, address registryAddress) {
        verifier = IVerifier(verifierAddress);
        registry = IRegistry(registryAddress);
    }

    /*//////////////////////////////////////////////////////////////
                          RECEIVE AND FALLBACK
    //////////////////////////////////////////////////////////////*/

    receive() external payable {}

    fallback() external payable {}

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function agree(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint256 wallet,
        uint256 intent,
        uint256 credential_hash,
        uint256 nonce,
        uint256 result_hash,
        address from,
        address to,
        address tokenAddress,
        uint256 amount
    ) external {
        // Ensure the credential hash in the proof matches the registered one
        // (registration stores Poseidon(wallet, pin, 0) as credential hash).
        if (registry.getCredentialHash(wallet) != credential_hash) {
            revert Delegation__InvalidCredentials();
        }

        if (registry.getUsedNonce(wallet, nonce)) {
            revert Delegation__NonceAlreadyUsed();
        }

        uint256[5] memory pubSignals = [
            wallet,
            intent,
            credential_hash,
            nonce,
            result_hash
        ];

        if (!verifier.verifyProof(_pA, _pB, _pC, pubSignals)) {
            revert Delegation__InvalidProof();
        }

        registry.useNonce(wallet, nonce);

        if (intent == 0) {
            _transfer(from, to, tokenAddress, amount);
        }

        emit Agree(wallet, credential_hash, nonce);
    }

    function withdraw(uint256 amount) external {
        if (msg.sender == address(0)) {
            revert Delegation__InvalidSender();
        }
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) {
            revert Delegation__TokenTransferFailed();
        }
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _transfer(
        address from,
        address to,
        address tokenAddress,
        uint256 amount
    ) internal {
        IERC20 token = IERC20(tokenAddress);
        if (token.balanceOf(from) < amount) {
            revert Delegation__NotEnoughBalance();
        }

        if (token.allowance(from, address(this)) < amount) {
            revert Delegation__InsufficientAllowance();
        }

        token.safeTransferFrom(from, to, amount);
    }
}
