import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authKeys } from "@/features/auth/api/auth.api";
import {
  createCatalogItem,
  getOrganization,
  listCatalog,
  listGstStates,
  updateOrganization,
  masterDataKeys,
  registerOrganization,
  updateCatalogItem,
  type Catalog,
} from "../api/masterData.api";

export function useCatalog<T>(catalog: Catalog) {
  return useQuery({ queryKey: masterDataKeys.catalog(catalog), queryFn: () => listCatalog<T>(catalog) });
}

export function useCreateCatalogItem(catalog: Catalog) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => createCatalogItem(catalog, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: masterDataKeys.catalog(catalog) }),
  });
}

export function useToggleCatalogItem(catalog: Catalog) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateCatalogItem(catalog, id, { isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: masterDataKeys.catalog(catalog) }),
  });
}

export function useRegisterOrganization() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: registerOrganization,
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user);
      navigate("/master");
    },
  });
}

export function useOrganization() {
  return useQuery({ queryKey: masterDataKeys.organization, queryFn: getOrganization });
}

export function useGstStates() {
  return useQuery({ queryKey: masterDataKeys.gstStates, queryFn: listGstStates, staleTime: Infinity });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateOrganization,
    onSuccess: (organization) => queryClient.setQueryData(masterDataKeys.organization, organization),
  });
}
