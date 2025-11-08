// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";
import {MockVerifier} from "./mocks/MockVerifier.sol";
import {MockEmailVerifier} from "./mocks/MockEmailVerifier.sol";

contract RegistryProofTest is Test {
    Registry private registry;
    MockVerifier private verifier;
    MockEmailVerifier private emailVerifier;

    uint256 private wallet = uint256(uint160(address(0xBEEF)));
    uint256 private intentRegister = 0; // register / recover
    uint256 private intentTransfer = 1; // transfer
    uint256 private credentialHash = 12345;
    uint256 private nonceA = 111;
    uint256 private nonceB = 222;
    uint256 private resultHash = 67890;

    // Dummy proof parameters (unused by mock)
    uint[2] private pA = [uint(0), uint(0)];
    uint[2][2] private pB = [[uint(0), uint(0)], [uint(0), uint(0)]];
    uint[2] private pC = [uint(0), uint(0)];

    function setUp() public {
        verifier = new MockVerifier(true);
        emailVerifier = new MockEmailVerifier();
        registry = new Registry(address(verifier), address(emailVerifier));
    }

    function testRegisterAcceptsValidProof() public {
        verifier.setShouldVerify(true);
        registry.register(
            pA,
            pB,
            pC,
            wallet,
            intentRegister,
            credentialHash,
            nonceA,
            resultHash
        );

        assertEq(
            registry.getCredentialHash(wallet),
            credentialHash,
            "credential hash stored"
        );
        assertTrue(registry.getUsedNonce(wallet, nonceA), "nonce marked used");
    }

    function testRegisterRejectsTamperedProof() public {
        verifier.setShouldVerify(false);
        vm.expectRevert(Registry.Registry__InvalidProof.selector);
        registry.register(
            pA,
            pB,
            pC,
            wallet,
            intentRegister,
            credentialHash,
            nonceA,
            resultHash
        );
    }

    function testNonceReusePreventionOnRegister() public {
        // Simulate a previously used nonce before any registration, so
        // registration should hit NonceAlreadyUsed (not AlreadyRegistered)
        registry.useNonce(wallet, nonceA);
        vm.expectRevert(Registry.Registry__NonceAlreadyUsed.selector);
        registry.register(
            pA,
            pB,
            pC,
            wallet,
            intentRegister,
            credentialHash,
            nonceA,
            resultHash
        );
    }

    function testProofReplayRejected() public {
        // Emulate a replay attempt by pre-marking the nonce as used for this wallet
        registry.useNonce(wallet, nonceA);
        vm.expectRevert(Registry.Registry__NonceAlreadyUsed.selector);
        registry.register(
            pA,
            pB,
            pC,
            wallet,
            intentRegister,
            credentialHash,
            nonceA,
            resultHash
        );
    }

    function testUsedNonceBlocksRegardlessOfCredentialHash() public {
        // Nonce usage is independent of credential hash value
        registry.useNonce(wallet, nonceA);
        vm.expectRevert(Registry.Registry__NonceAlreadyUsed.selector);
        registry.register(
            pA,
            pB,
            pC,
            wallet,
            intentRegister,
            credentialHash + 1,
            nonceA,
            resultHash
        );
    }

    function testRecoverRequiresEmailVerification() public {
        verifier.setShouldVerify(true);
        // First register
        registry.register(
            pA,
            pB,
            pC,
            wallet,
            intentRegister,
            credentialHash,
            nonceA,
            resultHash
        );

        // Attempt recover without verification
        vm.expectRevert(Registry.Registry__NotVerified.selector);
        registry.recover(
            pA,
            pB,
            pC,
            wallet,
            intentRegister,
            credentialHash,
            nonceB,
            resultHash
        );

        // Mark verified and recover
        emailVerifier.setVerified(registry.uintToAddress(wallet), true);
        registry.recover(
            pA,
            pB,
            pC,
            wallet,
            intentRegister,
            credentialHash,
            nonceB,
            resultHash
        );
        assertTrue(
            registry.getUsedNonce(wallet, nonceB),
            "recovery nonce consumed"
        );
    }
}
