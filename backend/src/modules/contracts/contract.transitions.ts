import type { ContractStatus } from "../../generated/prisma/client.js";

export const contractTransitions = {
  cancel: { from: ["ACTIVE"] as ContractStatus[], to: "CANCELLED" as ContractStatus },
};
