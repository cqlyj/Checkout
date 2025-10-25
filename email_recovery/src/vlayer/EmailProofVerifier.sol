// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {EmailDomainProver} from "./EmailDomainProver.sol";

import {Proof} from "vlayer-0.1.0/Proof.sol";
import {Verifier} from "vlayer-0.1.0/Verifier.sol";
import {Ownable} from "@openzeppelin-contracts-5.0.1/access/Ownable.sol";
import {EIP712} from "@openzeppelin-contracts-5.0.1/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin-contracts-5.0.1/utils/cryptography/ECDSA.sol";
import {Nonces} from "@openzeppelin-contracts-5.0.1/utils/Nonces.sol";

contract EmailDomainVerifier is Verifier, Ownable, EIP712, Nonces {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    address public prover;

    // EIP-712 typehash for the SetEmail action
    bytes32 private constant _SET_EMAIL_TYPEHASH =
        keccak256(
            "SetEmail(address wallet,bytes32 emailHash,uint256 nonce,uint256 deadline)"
        );

    mapping(address wallet => bytes32 emailHash) public walletToEmailHash;
    mapping(address wallet => bool emailVerified) public walletToEmailVerified;

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error EmailDomainVerifier__SignatureExpired();
    error EmailDomainVerifier__InvalidSignature();
    error EmailDomainVerifier__EmailNotMatched();

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event Verified(address indexed wallet);

    constructor(
        address _prover
    ) Ownable(msg.sender) EIP712("EmailDomainVerifier", "1") {
        prover = _prover;
    }

    /*//////////////////////////////////////////////////////////////
                     EXTERNAL AND PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    // Only owner can set the email hash => To solve issue of email change
    // Requires an off-chain EIP-712 signature by the wallet owner authorizing this change
    function setEmailHash(
        address _wallet,
        bytes32 _emailHash,
        uint256 deadline,
        bytes calldata signature
    ) public onlyOwner {
        if (block.timestamp > deadline) {
            revert EmailDomainVerifier__SignatureExpired();
        }

        uint256 currentNonce = nonces(_wallet);
        bytes32 structHash = keccak256(
            abi.encode(
                _SET_EMAIL_TYPEHASH,
                _wallet,
                _emailHash,
                currentNonce,
                deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        if (signer != _wallet) {
            revert EmailDomainVerifier__InvalidSignature();
        }

        walletToEmailHash[_wallet] = _emailHash;
        _useNonce(_wallet);
    }

    function verify(
        Proof calldata,
        bytes32 _emailHash,
        address _targetWallet
    ) public onlyVerified(prover, EmailDomainProver.main.selector) {
        if (walletToEmailHash[_targetWallet] != _emailHash) {
            revert EmailDomainVerifier__EmailNotMatched();
        }

        walletToEmailVerified[_targetWallet] = true;

        emit Verified(_targetWallet);
    }

    /*//////////////////////////////////////////////////////////////
                            HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    // The Registry contract will check this to see if the wallet is able to reset their pin
    // and once they successfully reset their pin, this state should be set back to false
    function getWalletToEmailVerified(
        address _wallet
    ) external view returns (bool) {
        return walletToEmailVerified[_wallet];
    }

    // This function will be called once listened to the Registry contract's event
    function setbackWalletToEmailVerified(address _wallet) public onlyOwner {
        walletToEmailVerified[_wallet] = false;
    }
}
