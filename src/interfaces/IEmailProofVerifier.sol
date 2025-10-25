// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IEmailDomainVerifier {
    function getWalletToEmailVerified(address) external view returns (bool);
}
