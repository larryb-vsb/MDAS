-- Quick fix for dev_system_settings table
-- Run this first, then run the full dbupdate7Nov2025.sql

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dev_system_settings' AND column_name='category') THEN
        ALTER TABLE dev_system_settings ADD COLUMN category VARCHAR(100);
        RAISE NOTICE 'Added category column';
    ELSE
        RAISE NOTICE 'category column already exists';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dev_system_settings' AND column_name='is_active') THEN
        ALTER TABLE dev_system_settings ADD COLUMN is_active BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added is_active column';
    ELSE
        RAISE NOTICE 'is_active column already exists';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dev_system_settings' AND column_name='created_by') THEN
        ALTER TABLE dev_system_settings ADD COLUMN created_by VARCHAR(100);
        RAISE NOTICE 'Added created_by column';
    ELSE
        RAISE NOTICE 'created_by column already exists';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dev_system_settings' AND column_name='updated_by') THEN
        ALTER TABLE dev_system_settings ADD COLUMN updated_by VARCHAR(100);
        RAISE NOTICE 'Added updated_by column';
    ELSE
        RAISE NOTICE 'updated_by column already exists';
    END IF;
END $$;

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'dev_system_settings' 
ORDER BY ordinal_position;
