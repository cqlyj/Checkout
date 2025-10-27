export enum StepKind {
  welcome,
  connectWallet,
  sendEmail,
  collectEmail,
  mintNft,
  success,
}

export type StepMeta = {
  path: string;
  kind: StepKind;
  title: string;
  description: string;
  headerIcon?: string;
  index: number;
  backUrl?: string;
};

export const stepsMeta: Record<StepKind, StepMeta> = {
  [StepKind.welcome]: {
    path: "",
    kind: StepKind.welcome,
    title: "Recover you pin with linked email",
    description: "",
    index: 0,
  },
  [StepKind.connectWallet]: {
    path: "connect-wallet",
    kind: StepKind.connectWallet,
    title: "Recover Pin",
    description:
      "To proceed to the next step, please connect your wallet now by clicking the button below.",
    backUrl: "",
    index: 1,
  },
  [StepKind.sendEmail]: {
    path: "send-email",
    kind: StepKind.sendEmail,
    title: "Send Email",
    description:
      "Please copy the details provided below and use them to send the email.",
    backUrl: "connect-wallet",
    index: 2,
  },
  [StepKind.collectEmail]: {
    path: "collect-email",
    kind: StepKind.collectEmail,
    title: "Waiting...",
    description:
      "Our mailbox is processing your email. Please wait a few seconds.",
    backUrl: "send-email",
    index: 2,
  },
  [StepKind.mintNft]: {
    path: "prove-and-verify",
    kind: StepKind.mintNft,
    title: "Reset your PIN",
    description: "Your email is ready for proving and verifying.",
    backUrl: "send-email",
    index: 3,
  },
  [StepKind.success]: {
    path: "success",
    kind: StepKind.success,
    title: "Success",
    description: "",
    headerIcon: "/img/success-icon.svg",
    index: 4,
  },
};
