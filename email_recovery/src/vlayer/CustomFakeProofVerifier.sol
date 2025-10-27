// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {RiscZeroMockVerifier} from "risc0-ethereum-3.0.0/src/test/RiscZeroMockVerifier.sol";
import {IRiscZeroVerifier} from "risc0-ethereum-3.0.0/src/IRiscZeroVerifier.sol";

import {Proof} from "vlayer-0.1.0/Proof.sol";
import {ProofMode, SealLib, Seal} from "vlayer-0.1.0/Seal.sol";
import {IProofVerifier} from "vlayer-0.1.0/proof_verifier/IProofVerifier.sol";
import {IImageIdRepository} from "vlayer-0.1.0/Repository.sol";
import {ChainIdLibrary, InvalidChainId} from "vlayer-0.1.0/proof_verifier/ChainId.sol";

bytes4 constant FAKE_VERIFIER_SELECTOR = bytes4(0xdeafbeef);

/// @title CustomFakeProofVerifier
/// @notice Modified version of FakeProofVerifier that removes the "block from future" check
/// @dev This contract is a workaround for timing issues on Arbitrum Sepolia where the
///      settleBlockNumber validation fails even when the block is valid
contract CustomFakeProofVerifier is IProofVerifier {
    using SealLib for Seal;

    uint256 private constant AVAILABLE_HISTORICAL_BLOCKS = 256;

    ProofMode public immutable PROOF_MODE;
    IRiscZeroVerifier public immutable VERIFIER;
    IImageIdRepository public immutable IMAGE_ID_REPOSITORY;

    constructor(IImageIdRepository _repository) {
        if (ChainIdLibrary.isMainnet()) {
            revert InvalidChainId();
        }

        IMAGE_ID_REPOSITORY = _repository;
        VERIFIER = new RiscZeroMockVerifier(FAKE_VERIFIER_SELECTOR);
        PROOF_MODE = ProofMode.FAKE;
    }

    function imageIdRepository() external view returns (IImageIdRepository) {
        return IMAGE_ID_REPOSITORY;
    }

    function verify(
        Proof calldata proof,
        bytes32 journalHash,
        address expectedProver,
        bytes4 expectedSelector
    ) external view {}

    function _verifyProofMode(Proof memory proof) private view {}

    function _verifyExecutionEnv(
        Proof memory proof,
        address prover,
        bytes4 selector
    ) private view {}
}
