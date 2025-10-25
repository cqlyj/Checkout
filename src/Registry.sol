// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IVerifier} from "./interfaces/IVerifier.sol";
import {IEmailDomainVerifier} from "./interfaces/IEmailProofVerifier.sol";

/// Intent:
/// 0: Register / Recover
/// 1: Transfer

contract Registry {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    IVerifier public zkVerifier;
    IEmailDomainVerifier public emailVerifier;
    mapping(uint256 wallet => uint256 credentialHash) public credentialHashes;
    mapping(uint256 wallet => mapping(uint256 nonce => bool usedOrNot))
        public usedNonces;

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error Registry__InvalidProof();
    error Registry__AlreadyRegistered();
    error Registry__InvalidIntent();
    error Registry__NonceAlreadyUsed();
    error Registry__NotVerified();
    error Registry__NotRegistered();

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event Registered(
        uint256 indexed wallet,
        uint256 credential_hash,
        uint256 nonce
    );

    event Recover(
        uint256 indexed wallet,
        uint256 credential_hash,
        uint256 nonce
    );

    /*//////////////////////////////////////////////////////////////
                               MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier OnlyVerified(uint256 wallet) {
        if (!isVerifiedToRecover(wallet)) {
            revert Registry__NotVerified();
        }
        _;
    }

    constructor(address zkVerifierAddress, address emailVerifierAddress) {
        zkVerifier = IVerifier(zkVerifierAddress);
        emailVerifier = IEmailDomainVerifier(emailVerifierAddress);
    }

    function register(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint256 wallet,
        uint256 intent,
        uint256 credential_hash,
        uint256 nonce,
        uint256 result_hash
    ) public {
        if (credentialHashes[wallet] != 0) {
            revert Registry__AlreadyRegistered();
        }

        if (intent != 0) {
            revert Registry__InvalidIntent();
        }

        if (usedNonces[wallet][nonce]) {
            revert Registry__NonceAlreadyUsed();
        }

        _register(
            _pA,
            _pB,
            _pC,
            wallet,
            intent,
            credential_hash,
            nonce,
            result_hash
        );

        emit Registered(wallet, credential_hash, nonce);
    }

    function recover(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint256 wallet,
        uint256 intent,
        uint256 credential_hash,
        uint256 nonce,
        uint256 result_hash
    ) external OnlyVerified(wallet) {
        _register(
            _pA,
            _pB,
            _pC,
            wallet,
            intent,
            credential_hash,
            nonce,
            result_hash
        );

        // Once this event is emitted, the state in EmailProofVerifier will be set back to false by the admin
        emit Recover(wallet, credential_hash, nonce);
    }

    function isVerifiedToRecover(uint256 wallet) public view returns (bool) {
        return emailVerifier.getWalletToEmailVerified(uintToAddress(wallet));
    }

    /*//////////////////////////////////////////////////////////////
                     INTERNAL AND PRIVATE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _register(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint256 wallet,
        uint256 intent,
        uint256 credential_hash,
        uint256 nonce,
        uint256 result_hash
    ) internal {
        uint256[5] memory pubSignals;
        pubSignals[0] = wallet;
        pubSignals[1] = intent;
        pubSignals[2] = credential_hash;
        pubSignals[3] = nonce;
        pubSignals[4] = result_hash;

        if (!zkVerifier.verifyProof(_pA, _pB, _pC, pubSignals)) {
            revert Registry__InvalidProof();
        }

        credentialHashes[wallet] = credential_hash;
        usedNonces[wallet][nonce] = true;
    }

    /*//////////////////////////////////////////////////////////////
                            HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function uintToAddress(uint256 _wallet) public pure returns (address) {
        return address(uint160(_wallet));
    }

    function getCredentialHash(uint256 wallet) external view returns (uint256) {
        return credentialHashes[wallet];
    }

    function useNonce(uint256 wallet, uint256 nonce) external {
        usedNonces[wallet][nonce] = true;
    }

    function getUsedNonce(
        uint256 wallet,
        uint256 nonce
    ) external view returns (bool) {
        return usedNonces[wallet][nonce];
    }
}
