export const MintNFT = ({
  currentStep,
  handleProving,
  handleVerify,
  txHash,
  verificationError,
}: {
  currentStep: string;
  handleProving: () => void;
  handleVerify: () => void;
  txHash: string | null;
  verificationError: string | null;
}) => {
  const isGo = currentStep === "Go";
  const isVerify = currentStep === "Verify";
  const isBusy = !isGo && !isVerify && currentStep !== "Done";
  const explorer = "https://arbitrum-sepolia.blockscout.com/tx/";

  return (
    <>
      <div className="mt-5 flex justify-center">
        {currentStep !== "Done" && (
          <button
            disabled={isBusy}
            type="button"
            id="nextButton"
            data-testid="mint-nft-button"
            onClick={isGo ? handleProving : isVerify ? handleVerify : undefined}
          >
            {isGo ? "Go" : isVerify ? "Verify" : currentStep}
          </button>
        )}
      </div>
      {txHash && currentStep === "Done" && (
        <div className="mt-5 flex justify-center gap-3">
          <a
            href={`${explorer}${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-indigo-600 px-5 py-3 text-white font-semibold"
          >
            View transaction
          </a>
          <button
            type="button"
            id="nextButton"
            className="rounded-lg bg-indigo-600 px-5 py-3 text-white font-semibold"
          >
            Finish
          </button>
        </div>
      )}
      {verificationError && (
        <div className="mt-5 flex justify-center">
          <p className="text-red-500">
            {verificationError.includes("User rejected the request")
              ? "User rejected the request"
              : verificationError}
          </p>
        </div>
      )}
    </>
  );
};
