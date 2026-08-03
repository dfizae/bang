import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getPropertyReports,
  savePropertyReport,
  type PropertyReport,
} from "@/lib/reportStorage";

const reportKeys = {
  user: (userId: number) => ["reports", userId] as const,
};

export function usePropertyReports(userId: number) {
  return useQuery({
    queryKey: reportKeys.user(userId),
    queryFn: () => getPropertyReports(userId),
  });
}

export function useSavePropertyReport(userId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (report: PropertyReport) => savePropertyReport(report),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: reportKeys.user(userId) }),
  });
}
