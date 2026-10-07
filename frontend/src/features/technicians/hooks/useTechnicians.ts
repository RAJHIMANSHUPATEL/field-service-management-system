import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTechnician, listTechnicians, technicianKeys, updateTechnician } from "../api/technicians.api";

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

export function useUpdateTechnician() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; skillIds?: string[]; serviceAreaIds?: string[] }) =>
      updateTechnician(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: technicianKeys.all });
    },
  });
}
