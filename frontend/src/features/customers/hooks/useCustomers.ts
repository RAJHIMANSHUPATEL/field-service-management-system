import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAddress,
  createContact,
  createCustomer,
  customerKeys,
  getCustomer,
  listCustomers,
} from "../api/customers.api";

export function useCustomers() {
  return useQuery({
    queryKey: customerKeys.all,
    queryFn: listCustomers,
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => getCustomer(id),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

export function useCreateContact(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createContact>[1]) => createContact(customerId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customerKeys.detail(customerId) });
    },
  });
}

export function useCreateAddress(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createAddress>[1]) => createAddress(customerId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customerKeys.detail(customerId) });
    },
  });
}
