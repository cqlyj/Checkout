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
        // Begin broadcast with the deployer configured via forge CLI flags
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

        // Write all deployed addresses to a machine-friendly file for scripting
        // Format: KEY=0x...
        {
            string memory root = vm.projectRoot();
            string memory addrPath = string.concat(root, "/addresses.txt");

            // truncate/create file
            vm.writeFile(addrPath, "");

            // Append lines (do not reorder keys without updating scripts)
            vm.writeLine(
                addrPath,
                string.concat(
                    "EMAIL_DOMAIN_PROVER=",
                    vm.toString(address(emailDomainProver))
                )
            );
            vm.writeLine(
                addrPath,
                string.concat(
                    "EMAIL_DOMAIN_VERIFIER=",
                    vm.toString(address(emailDomainVerifier))
                )
            );
            vm.writeLine(
                addrPath,
                string.concat(
                    "CUSTOM_FAKE_PROOF_VERIFIER=",
                    vm.toString(address(customVerifier))
                )
            );
            vm.writeLine(
                addrPath,
                string.concat(
                    "GROTH16_VERIFIER=",
                    vm.toString(address(groth16Verifier))
                )
            );
            vm.writeLine(
                addrPath,
                string.concat("MOCK_USDC=", vm.toString(address(mockUSDC)))
            );
            vm.writeLine(
                addrPath,
                string.concat("REGISTRY=", vm.toString(address(registry)))
            );
            vm.writeLine(
                addrPath,
                string.concat("DELEGATION=", vm.toString(address(delegation)))
            );

            console.log("addresses.txt written at:", addrPath);
        }

        // Optionally mint tokens to a user wallet
        // The connected wallet address is discovered from either EIP7702_PRIVATE_KEY or CONNECTED_WALLET_ADDRESS env vars.
        // - If EIP7702_PRIVATE_KEY is set, we'll also auto-approve Delegation from that wallet (second broadcast).
        {
            uint256 userPk = vm.envOr("EIP7702_PRIVATE_KEY", uint256(0));
            address userAddr = userPk != 0
                ? vm.addr(userPk)
                : vm.envOr("CONNECTED_WALLET_ADDRESS", address(0));

            if (userAddr != address(0)) {
                uint256 mintAmount = 1_000_000 * (10 ** mockUSDC.decimals()); // 1M USDC
                mockUSDC.mint(userAddr, mintAmount);
                console.log("Minted USDC to:", userAddr);
            } else {
                console.log(
                    "Skip mint: provide EIP7702_PRIVATE_KEY or CONNECTED_WALLET_ADDRESS env"
                );
            }

            vm.stopBroadcast(); // end deployer broadcast before switching signer

            if (userPk != 0) {
                // Approve Delegation from the user's wallet if PK is provided
                vm.startBroadcast(userPk);
                mockUSDC.approve(address(delegation), type(uint256).max);
                console.log(
                    "Approved Delegation to spend USDC from user wallet:",
                    userAddr
                );
                vm.stopBroadcast();
            }
        }
    }
}
