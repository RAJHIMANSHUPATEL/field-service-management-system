import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTechnician, listTechnicians, technicianKeys } from "../api/technicians.api";

export function useTechnicians() {
  return useQuery({
    queryKey: technicianKeys.all,
    queryFn: listTechnicians,
  });
}

export function useCreateTechnician() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTechnician,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: technicianKeys.all });
    },
  });
}
