-- Find specific upload by ID: uploader_1762272044177_hoc4txm07
-- Query both production and development tables

-- Production table
SELECT 
    'PRODUCTION' as environment,
    id,
    filename,
    upload_status,
    uploaded_at,
    NOW() - uploaded_at AS time_since_upload,
    current_phase,
    deleted_at,
    deleted_by,
    processing_notes
FROM uploader_uploads
WHERE id = 'uploader_1762272044177_hoc4txm07';

-- Development table (if exists)
SELECT 
    'DEVELOPMENT' as environment,
    id,
    filename,
    upload_status,
    uploaded_at,
    NOW() - uploaded_at AS time_since_upload,
    current_phase,
    deleted_at,
    deleted_by,
    processing_notes
FROM dev_uploader_uploads
WHERE id = 'uploader_1762272044177_hoc4txm07';
