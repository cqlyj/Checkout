// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Delegation} from "src/Delegation.sol";
import {Registry} from "src/Registry.sol";
import {Groth16Verifier} from "src/verifier.sol";
import {EmailDomainVerifier} from "email_recovery/src/vlayer/EmailProofVerifier.sol";
import {EmailDomainProver} from "email_recovery/src/vlayer/EmailDomainProver.sol";
import {MockUSDC} from "test/mocks/MockUSDC.sol";
import {CustomFakeProofVerifier} from "email_recovery/src/vlayer/CustomFakeProofVerifier.sol";
import {Repository} from "vlayer-0.1.0/Repository.sol";

contract DeployAll is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy vlayer contracts
        EmailDomainProver emailDomainProver = new EmailDomainProver();
        console.log(
            "EmailDomainProver deployed at:",
            address(emailDomainProver)
        );

        EmailDomainVerifier emailDomainVerifier = new EmailDomainVerifier(
            address(emailDomainProver)
        );
        console.log(
            "EmailDomainVerifier deployed at:",
            address(emailDomainVerifier)
        );

        // Deploy custom verifier (with "block from future" check removed)
        address existingRepository = 0x0cFfdB4e737F00Ef57b4c61dBfBb334B3a416519;
        CustomFakeProofVerifier customVerifier = new CustomFakeProofVerifier(
            Repository(existingRepository)
        );
        console.log(
            "CustomFakeProofVerifier deployed at:",
            address(customVerifier)
        );

        // Set the custom verifier on EmailDomainVerifier
        emailDomainVerifier._setTestVerifier(customVerifier);
        console.log("Custom verifier set on EmailDomainVerifier");

        // Deploy other contracts
        Groth16Verifier groth16Verifier = new Groth16Verifier();
        console.log("Groth16Verifier deployed at:", address(groth16Verifier));

        MockUSDC mockUSDC = new MockUSDC();
        console.log("MockUSDC deployed at:", address(mockUSDC));

        Registry registry = new Registry(
            address(groth16Verifier),
            address(emailDomainVerifier)
        );
        console.log("Registry deployed at:", address(registry));

        Delegation delegation = new Delegation(
            address(groth16Verifier),
            address(registry)
        );
        console.log("Delegation deployed at:", address(delegation));

        vm.stopBroadcast();
    }
}
