import { useQuery } from "@tanstack/react-query";
import { authKeys, getCurrentUser } from "../api/auth.api";

export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: getCurrentUser,
    retry: false,
  });
}
