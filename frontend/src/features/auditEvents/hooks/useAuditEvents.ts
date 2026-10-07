import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { auditEventKeys, listAuditEvents } from "../api/auditEvents.api";

export function useAuditEvents(page: number) {
  return useQuery({
    queryKey: auditEventKeys.page(page),
    queryFn: () => listAuditEvents(page),
    placeholderData: keepPreviousData,
  });
}
