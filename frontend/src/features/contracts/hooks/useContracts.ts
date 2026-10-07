import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelContract,
  contractKeys,
  createContract,
  createPlan,
  listContracts,
  listPlans,
  movePlan,
  runPlans,
  type ContractInput,
  type PlanInput,
} from "../api/contracts.api";

export function useContracts() {
  return useQuery({ queryKey: contractKeys.contracts, queryFn: listContracts });
}

export function usePlans() {
  return useQuery({ queryKey: contractKeys.plans, queryFn: listPlans });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: contractKeys.contracts });
    void queryClient.invalidateQueries({ queryKey: contractKeys.plans });
    void queryClient.invalidateQueries({ queryKey: ["work-orders"] });
  };
}

export function useCreateContract() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (input: ContractInput) => createContract(input), onSuccess: refresh });
}

export function useCancelContract() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelContract(id, reason), onSuccess: refresh });
}

export function useCreatePlan() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (input: PlanInput) => createPlan(input), onSuccess: refresh });
}

export function useMovePlan() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" }) => movePlan(id, action), onSuccess: refresh });
}

export function useRunPlans() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: runPlans, onSuccess: refresh });
}
