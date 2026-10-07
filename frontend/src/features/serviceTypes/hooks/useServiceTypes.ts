import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServiceType, listServiceTypes, serviceTypeKeys } from "../api/serviceTypes.api";

export function useServiceTypes() {
  return useQuery({
    queryKey: serviceTypeKeys.all,
    queryFn: listServiceTypes,
  });
}

export function useCreateServiceType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createServiceType,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serviceTypeKeys.all });
    },
  });
}
