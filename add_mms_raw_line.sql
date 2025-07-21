-- Add MMS-RAW-Line field to TDDF records table
ALTER TABLE dev_tddf_records ADD COLUMN IF NOT EXISTS mms_raw_line TEXT;
ALTER TABLE tddf_records ADD COLUMN IF NOT EXISTS mms_raw_line TEXT;

-- Add comment to explain the purpose
COMMENT ON COLUMN dev_tddf_records.mms_raw_line IS 'Custom MMS-RAW-Line field to store original line before processing decisions';
COMMENT ON COLUMN tddf_records.mms_raw_line IS 'Custom MMS-RAW-Line field to store original line before processing decisions';
