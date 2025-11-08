// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IEmailDomainVerifier} from "../../src/interfaces/IEmailProofVerifier.sol";

contract MockEmailVerifier is IEmailDomainVerifier {
    mapping(address => bool) public verified;

    function setVerified(address wallet, bool isVerified) external {
        verified[wallet] = isVerified;
    }

    function getWalletToEmailVerified(
        address wallet
    ) external view returns (bool) {
        return verified[wallet];
    }
}
