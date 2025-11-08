// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IVerifier} from "../../src/interfaces/IVerifier.sol";

contract MockVerifier is IVerifier {
    bool public shouldVerify;

    constructor(bool _shouldVerify) {
        shouldVerify = _shouldVerify;
    }

    function setShouldVerify(bool _shouldVerify) external {
        shouldVerify = _shouldVerify;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[5] calldata
    ) external view override returns (bool) {
        return shouldVerify;
    }
}
