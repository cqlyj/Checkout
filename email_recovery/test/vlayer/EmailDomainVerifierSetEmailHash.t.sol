// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Test} from "forge-std/Test.sol";

import {EmailDomainVerifier} from "../../src/vlayer/EmailProofVerifier.sol";

contract EmailDomainVerifierSetEmailHashTest is Test {
    EmailDomainVerifier private verifier;

    // Typehash copied from the contract
    bytes32 private constant _SET_EMAIL_TYPEHASH =
        keccak256(
            "SetEmail(address wallet,bytes32 emailHash,uint256 nonce,uint256 deadline)"
        );

    // EIP712Domain typehash per EIP-712
    bytes32 private constant _EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    function setUp() public {
        // Any address can be used as prover for these tests; it's not used here
        address dummyProver = address(0xBEEF);
        verifier = new EmailDomainVerifier(dummyProver);
    }

    function test_SetEmailHash_Succeeds_WithValidSignature() public {
        (uint256 pk, address wallet) = _randomSigner(1);

        bytes32 emailHash = keccak256(abi.encodePacked("alice@example.com"));
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory signature = _signSetEmail(pk, wallet, emailHash, deadline);

        // Call as owner (deployer is owner)
        verifier.setEmailHash(wallet, emailHash, deadline, signature);

        // Assertions
        assertEq(
            verifier.walletToEmailHash(wallet),
            emailHash,
            "emailHash not set"
        );
        assertEq(verifier.nonces(wallet), 1, "nonce not consumed");
    }

    function test_RevertWhen_Replay() public {
        (uint256 pk, address wallet) = _randomSigner(2);

        bytes32 emailHash = keccak256(abi.encodePacked("bob@example.com"));
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory signature = _signSetEmail(pk, wallet, emailHash, deadline);

        // First call succeeds
        verifier.setEmailHash(wallet, emailHash, deadline, signature);

        // Second call with same signature should fail due to nonce mismatch
        vm.expectRevert(EmailDomainVerifier.EmailDomainVerifier__InvalidSignature.selector);
        verifier.setEmailHash(wallet, emailHash, deadline, signature);
    }

    function test_RevertWhen_ExpiredDeadline() public {
        (uint256 pk, address wallet) = _randomSigner(3);

        bytes32 emailHash = keccak256(abi.encodePacked("carol@example.com"));
        uint256 pastDeadline = block.timestamp - 1;

        bytes memory signature = _signSetEmail(
            pk,
            wallet,
            emailHash,
            pastDeadline
        );

        vm.expectRevert(EmailDomainVerifier.EmailDomainVerifier__SignatureExpired.selector);
        verifier.setEmailHash(wallet, emailHash, pastDeadline, signature);
    }

    function test_RevertWhen_InvalidSigner() public {
        (uint256 pkWallet, address wallet) = _randomSigner(4);
        (uint256 pkOther, ) = _randomSigner(5);

        bytes32 emailHash = keccak256(abi.encodePacked("dave@example.com"));
        uint256 deadline = block.timestamp + 1 hours;

        // Build digest for wallet, but sign with another private key
        bytes32 structHash = keccak256(
            abi.encode(
                _SET_EMAIL_TYPEHASH,
                wallet,
                emailHash,
                verifier.nonces(wallet),
                deadline
            )
        );
        bytes32 domainSeparator = _domainSeparator(address(verifier));
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pkOther, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.expectRevert(EmailDomainVerifier.EmailDomainVerifier__InvalidSignature.selector);
        verifier.setEmailHash(wallet, emailHash, deadline, signature);
    }

    // Helpers
    function _randomSigner(
        uint256 salt
    ) internal pure returns (uint256 pk, address wallet) {
        pk = uint256(keccak256(abi.encodePacked("pk:", salt)));
        // Ensure pk is not zero
        if (pk == 0) {
            pk = 1;
        }
        wallet = vm.addr(pk);
    }

    function _signSetEmail(
        uint256 pk,
        address wallet,
        bytes32 emailHash,
        uint256 deadline
    ) internal view returns (bytes memory signature) {
        bytes32 structHash = keccak256(
            abi.encode(
                _SET_EMAIL_TYPEHASH,
                wallet,
                emailHash,
                verifier.nonces(wallet),
                deadline
            )
        );
        bytes32 domainSeparator = _domainSeparator(address(verifier));
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        signature = abi.encodePacked(r, s, v);
    }

    function _domainSeparator(
        address verifyingContract
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _EIP712_DOMAIN_TYPEHASH,
                    keccak256(bytes("EmailDomainVerifier")),
                    keccak256(bytes("1")),
                    block.chainid,
                    verifyingContract
                )
            );
    }
}
