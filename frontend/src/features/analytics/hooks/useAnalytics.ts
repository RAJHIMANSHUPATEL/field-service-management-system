import { useQuery } from "@tanstack/react-query";
import { getDashboard, getPerformance } from "../api/analytics.api";

export function useDashboard() {
  return useQuery({ queryKey: ["analytics", "dashboard"], queryFn: getDashboard, refetchInterval: 60_000 });
}

export function usePerformance(days: number) {
  return useQuery({ queryKey: ["analytics", "technicians", days], queryFn: () => getPerformance(days) });
}
