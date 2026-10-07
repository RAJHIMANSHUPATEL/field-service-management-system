import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryKeys, listMovements, listStock, recordStock } from "../api/inventory.api";

export function useStock() {
  return useQuery({ queryKey: inventoryKeys.stock, queryFn: listStock });
}

export function useMovements(enabled = true) {
  return useQuery({ queryKey: inventoryKeys.movements, queryFn: listMovements, enabled });
}

export function useRecordStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recordStock,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["inventory"] }),
  });
}
