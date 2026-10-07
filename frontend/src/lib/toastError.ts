import { toast } from "sonner";
import { ApiError } from "./apiClient";

export function toastError(error: unknown, fallback: string) {
  toast.error(error instanceof ApiError ? error.message : fallback);
}
