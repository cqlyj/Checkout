import { useEmailProofVerification } from "../../shared/hooks/useEmailProofVerification";
import { MintNFT } from "./Presentational";
import { useLocalStorage } from "usehooks-ts";

export const MintNFTContainer = () => {
  const [emlFile] = useLocalStorage("emlFile", "");

  const { currentStep, startProving, handleVerify, txHash, verificationError } =
    useEmailProofVerification();

  const handleProving = () => {
    if (emlFile) {
      void startProving(emlFile);
    }
  };

  return (
    <MintNFT
      currentStep={currentStep}
      handleProving={handleProving}
      handleVerify={handleVerify}
      txHash={txHash}
      verificationError={verificationError?.message ?? null}
    />
  );
};
