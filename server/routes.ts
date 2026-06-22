import type { Express } from "express";
import { buildXlsmBuffer, XLSM_MIME, XLSM_FILENAME } from "./xlsm.js";
import { exportRequestSchema } from "../shared/schema.js";

export function registerRoutes(app: Express): Express {
  // --- Export ---------------------------------------------------------------
  app.post("/api/export", async (req, res) => {
    const parsed = exportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }
    try {
      const table = parsed.data;
      const buffer = buildXlsmBuffer(table);
      res.json({
        fileBase64: buffer.toString("base64"),
        fileName: XLSM_FILENAME,
        mimeType: XLSM_MIME,
        columns: table.columns,
        rows: table.rows,
        usedDemo: false,
        rowCount: table.rows.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to generate spreadsheet" });
    }
  });

  return app;
}
