// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Delegation} from "../src/Delegation.sol";
import {Registry} from "../src/Registry.sol";
import {MockVerifier} from "./mocks/MockVerifier.sol";
import {MockEmailVerifier} from "./mocks/MockEmailVerifier.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract DelegationProofTest is Test {
    Delegation private delegation;
    Registry private registry;
    MockVerifier private verifier;
    MockEmailVerifier private emailVerifier;
    MockUSDC private usdc;

    address private user = address(0xA11CE);
    address private recipient = address(0xB0B);
    uint256 private wallet = uint256(uint160(user));
    uint256 private intentRegisterOrTransfer = 0;
    uint256 private intentOther = 1;
    uint256 private credentialHash = 12345;
    uint256 private nonce = 777;
    uint256 private resultHash = 88888;
    uint256 private amount = 1_000_000; // 1 USDC (6 decimals)

    // Dummy proof parameters (unused by mock)
    uint[2] private pA = [uint(0), uint(0)];
    uint[2][2] private pB = [[uint(0), uint(0)], [uint(0), uint(0)]];
    uint[2] private pC = [uint(0), uint(0)];

    function setUp() public {
        verifier = new MockVerifier(true);
        emailVerifier = new MockEmailVerifier();
        registry = new Registry(address(verifier), address(emailVerifier));
        delegation = new Delegation(address(verifier), address(registry));
        usdc = new MockUSDC();

        // Register user so registry has a credentialHash
        registry.register(
            pA,
            pB,
            pC,
            wallet,
            intentRegisterOrTransfer,
            credentialHash,
            1,
            resultHash
        );
        // Fund user and approve delegation
        vm.startPrank(user);
        usdc.mint(user, 10_000_000);
        usdc.approve(address(delegation), type(uint256).max);
        vm.stopPrank();
    }

    function testAgreeValidProofTransfersAndConsumesNonce() public {
        verifier.setShouldVerify(true);
        uint256 startUser = usdc.balanceOf(user);
        uint256 startRecipient = usdc.balanceOf(recipient);

        delegation.agree(
            pA,
            pB,
            pC,
            wallet,
            intentRegisterOrTransfer,
            credentialHash,
            nonce,
            resultHash,
            user,
            recipient,
            address(usdc),
            amount
        );

        assertTrue(
            registry.getUsedNonce(wallet, nonce),
            "nonce consumed in registry"
        );
        assertEq(usdc.balanceOf(user), startUser - amount, "debited");
        assertEq(
            usdc.balanceOf(recipient),
            startRecipient + amount,
            "credited"
        );
    }

    function testAgreeRejectsTamperedProof() public {
        verifier.setShouldVerify(false);
        vm.expectRevert(Delegation.Delegation__InvalidProof.selector);
        delegation.agree(
            pA,
            pB,
            pC,
            wallet,
            intentRegisterOrTransfer,
            credentialHash,
            nonce,
            resultHash,
            user,
            recipient,
            address(usdc),
            amount
        );
    }

    function testAgreeRejectsNonceReuse() public {
        verifier.setShouldVerify(true);
        delegation.agree(
            pA,
            pB,
            pC,
            wallet,
            intentRegisterOrTransfer,
            credentialHash,
            nonce,
            resultHash,
            user,
            recipient,
            address(usdc),
            amount
        );

        vm.expectRevert(Delegation.Delegation__NonceAlreadyUsed.selector);
        delegation.agree(
            pA,
            pB,
            pC,
            wallet,
            intentRegisterOrTransfer,
            credentialHash,
            nonce,
            resultHash,
            user,
            recipient,
            address(usdc),
            amount
        );
    }

    function testReplayAttackRejectedDifferentIntentSameNonce() public {
        verifier.setShouldVerify(true);
        delegation.agree(
            pA,
            pB,
            pC,
            wallet,
            intentRegisterOrTransfer,
            credentialHash,
            nonce,
            resultHash,
            user,
            recipient,
            address(usdc),
            amount
        );

        // Attempt reuse of the same nonce with a different intent
        vm.expectRevert(Delegation.Delegation__NonceAlreadyUsed.selector);
        delegation.agree(
            pA,
            pB,
            pC,
            wallet,
            intentOther,
            credentialHash,
            nonce,
            resultHash,
            user,
            recipient,
            address(usdc),
            amount
        );
    }
}
