-- PRODUCTION: Find upload by ID
-- Upload ID: uploader_1762272044177_hoc4txm07

SELECT 
    id,
    filename,
    upload_status,
    uploaded_at,
    NOW() - uploaded_at AS time_in_system,
    current_phase,
    deleted_at,
    deleted_by,
    processing_notes
FROM uploader_uploads
WHERE id = 'uploader_1762272044177_hoc4txm07';
