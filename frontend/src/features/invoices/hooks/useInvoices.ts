import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getInvoice, invoiceKeys, listInvoices, type Invoice } from "../api/invoices.api";

export function useInvoices() {
  return useQuery({ queryKey: invoiceKeys.all, queryFn: listInvoices });
}

export function useInvoice(id: string) {
  return useQuery({ queryKey: invoiceKeys.detail(id), queryFn: () => getInvoice(id) });
}

export function useInvoiceAction<T>(id: string, action: (input: T) => Promise<Invoice>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (invoice) => {
      queryClient.setQueryData(invoiceKeys.detail(id), invoice);
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}
