import { z } from "zod";

export type ParsedTable = {
  columns: string[];
  rows: Record<string, string | number>[];
};

// Request body for the export endpoint.
export const exportRequestSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.union([z.string(), z.number()]))),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;
