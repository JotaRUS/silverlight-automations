-- Add export tracking timestamps to Lead
ALTER TABLE "Lead" ADD COLUMN "googleSheetsExportedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "supabaseExportedAt" TIMESTAMP(3);
