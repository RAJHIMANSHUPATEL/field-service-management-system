import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customerKeys } from "@/features/customers/api/customers.api";
import { createAsset, updateAsset } from "../api/assets.api";

export function useSaveAsset(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: { id?: string } & Parameters<typeof createAsset>[0] & { status?: "ACTIVE" | "OUT_OF_SERVICE" | "DECOMMISSIONED" },
    ) => {
      const { id, customerId: ownerId, status, ...fields } = input;
      if (id) {
        return updateAsset(id, { ...fields, status });
      }
      return createAsset({ ...fields, customerId: ownerId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customerKeys.detail(customerId) });
    },
  });
}
