-- Complete MCC Schema Update - TSYS DACQ_MER_DTL Field Specification
-- Extracted from TSYS documentation image
-- This will update/insert all merchant detail fields with proper tab positions

-- Clear existing schema (optional - uncomment if you want fresh start)
-- TRUNCATE TABLE dev_merchant_mcc_schema RESTART IDENTITY CASCADE;

INSERT INTO dev_merchant_mcc_schema (position, field_name, field_length, format, description, mms_enabled, tab_position) VALUES
-- TAB 1: Basic Merchant Information
('01-30', 'Full Name', 30, 'AN', 'The name of the merchant as reported.', 1, '1'),
('31-60', 'Doing Business As', 30, 'AN', 'The DBA name of the merchant.', 1, '1'),
('61-90', 'Association Name', 30, 'AN', 'The name of the association the merchant.', 1, '1'),
('91-130', 'Address Line 1', 40, 'AN', 'The merchant business location street address.', 1, '1'),
('131-170', 'Address Line 2', 40, 'AN', 'The merchant business location street address - continued.', 1, '1'),
('171-183', 'DBA Address City', 13, 'AN', 'The city name the merchant''s location resides.', 1, '1'),
('184-185', 'DBA Address State/Province', 2, 'AN', 'The state or province of the merchant''s location', 1, '1'),
('186-194', 'DBA Address Postal Code', 9, 'AN', 'The postal code of the merchant''s location', 1, '1'),
('195-200', 'Service Establish Date', 6, 'N', 'The business network establish date of the merchant. YYMMDD', 1, '1'),
('201-220', 'Business License', 20, 'AN', 'The business network license of the merchant. Varies by state.', 1, '1'),
('221-240', 'Card Brand License', 20, 'AN', 'The business network license of the merchant', 1, '1'),
('241-249', 'Federal Tax ID', 9, 'N', 'The merchant''s Federal Tax ID', 1, '1'),
('250-251', 'Business Category', 2, 'N', 'The business category code', 1, '1'),
('252-255', 'Merchant Category Code', 4, 'N', 'The merchant category code (MCC)', 1, '1'),
('256-261', 'Filler', 6, 'AN', 'Reserved for future use', 0, '1'),

-- TAB 2: Billing and Settlement
('262-263', 'Billing Type', 2, 'AN', 'A merchant billing type', 1, '2'),
('264-265', 'Settlement', 2, 'AN', 'Settlement method', 1, '2'),
('266', 'Visa Chargeback', 1, 'AN', 'Visa chargeback indicator', 1, '2'),
('267', 'MC Split', 1, 'AN', 'A merchant split', 1, '2'),
('268', 'Tiered Pricing', 1, 'AN', 'Tiered pricing indicator', 1, '2'),
('269-270', 'Filler', 2, 'AN', 'Reserved', 0, '2'),
('271-280', 'DBA Number', 10, 'AN', 'The merchant number for the location. Alpha-numeric.', 1, '2'),
('281-290', 'Outlet Number', 10, 'AN', 'A unique merchant outlet ID', 1, '2'),
('291-294', 'Agent Bank', 4, 'N', 'Agent bank number', 1, '2'),
('295-300', 'Agent Chain', 6, 'N', 'The agent chain number', 1, '2'),
('301-308', 'SE Number', 8, 'N', 'SE (Sales Executive) number', 1, '2'),
('309-318', 'AMEX SE', 10, 'AN', 'American Express service establishment ID', 1, '2'),
('319-333', 'AMEX Number', 15, 'AN', 'American Express merchant number', 1, '2'),
('334-348', 'Discover Number', 15, 'AN', 'Discover merchant number', 1, '2'),
('349-363', 'V/MC Number', 15, 'AN', 'Visa/MasterCard merchant number', 1, '2'),
('364-378', 'Debit Number', 15, 'AN', 'Debit merchant number', 1, '2'),
('379-393', 'EBT Number', 15, 'AN', 'EBT (Electronic Benefit Transfer) merchant number', 1, '2'),
('394-408', 'Filler', 15, 'AN', 'Reserved', 0, '2'),

-- TAB 3: Banking Information
('409-417', 'ABA Routing#', 9, 'N', 'ABA routing number for merchant bank account', 1, '3'),
('418-434', 'DDA Number', 17, 'AN', 'DDA (Demand Deposit Account) account number', 1, '3'),
('435-464', 'Account Name', 30, 'AN', 'The bank account name', 1, '3'),
('465', 'Account Type', 1, 'AN', 'The account type. C=Checking, S=Savings, L=Loan', 1, '3'),
('466', 'Third Party', 1, 'AN', 'Third party indicator', 1, '3'),
('467', 'Paper Draft', 1, 'AN', 'Paper draft indicator', 1, '3'),
('468-497', 'Factoring Co Name', 30, 'AN', 'Factoring company name', 0, '3'),
('498-507', 'Factoring Co Phone', 10, 'N', 'Factoring company phone number', 0, '3'),
('508-516', 'Factoring Co ABA#', 9, 'N', 'Factoring company ABA routing number', 0, '3'),
('517-533', 'Factoring Co DDA#', 17, 'AN', 'Factoring company DDA account', 0, '3'),
('534-563', 'Factoring Co Acct Name', 30, 'AN', 'Factoring company account name', 0, '3'),
('564', 'Factoring Co Acct Type', 1, 'AN', 'Factoring company account type', 0, '3'),
('565', 'Wire Routing Flag', 1, 'AN', 'Wire routing flag', 0, '3'),
('566', 'Wire DDA Flag', 1, 'AN', 'Wire DDA flag', 0, '3'),
('567-581', 'Filler', 15, 'AN', 'Reserved', 0, '3'),

-- TAB 4: Terminal Location Information
('582-589', 'Term ID', 8, 'AN', 'Terminal ID', 1, '4'),
('590-629', 'Address Line 1', 40, 'AN', 'Terminal address line 1', 1, '4'),
('630-669', 'Address Line 2', 40, 'AN', 'Terminal address line 2', 1, '4'),
('670-709', 'Address Line 3', 40, 'AN', 'Terminal address line 3', 0, '4'),
('710-722', 'Address City', 13, 'AN', 'Terminal city', 1, '4'),
('723-724', 'Address State', 2, 'AN', 'Terminal state', 1, '4'),
('725-733', 'Address Postal', 9, 'AN', 'Terminal postal code', 1, '4'),
('734-743', 'AMEX SE#', 10, 'AN', 'AMEX SE number for terminal', 1, '4'),
('744-758', 'AMEX Merchant#', 15, 'AN', 'AMEX merchant number for terminal', 1, '4'),
('759-773', 'Discover Merchant#', 15, 'AN', 'Discover merchant number for terminal', 1, '4'),
('774-788', 'Debit Merchant#', 15, 'AN', 'Debit merchant number for terminal', 1, '4'),
('789-803', 'EBT Merchant#', 15, 'AN', 'EBT merchant number for terminal', 1, '4'),
('804-818', 'Filler', 15, 'AN', 'Reserved', 0, '4'),
('819-833', 'V/MC Merchant#', 15, 'AN', 'Visa/MC merchant number for terminal', 1, '4'),
('834-848', 'Filler', 15, 'AN', 'Reserved', 0, '4'),

-- TAB 5: Terminal Configuration
('849-856', 'AMEX Terminal ID', 8, 'AN', 'AMEX terminal ID', 1, '5'),
('857-872', 'Discover Terminal ID', 16, 'AN', 'Discover terminal ID', 1, '5'),
('873-880', 'V/MC Terminal ID', 8, 'AN', 'Visa/MC terminal ID', 1, '5'),
('881-888', 'Debit Terminal ID', 8, 'AN', 'Debit terminal ID', 1, '5'),
('889-896', 'EBT Terminal ID', 8, 'AN', 'EBT terminal ID', 1, '5'),
('897', 'Purchase Devices', 1, 'AN', 'Purchase device type', 1, '5'),
('898', 'Terminal Capability', 1, 'AN', 'Terminal capability code', 1, '5'),
('899', 'Terminal Environment', 1, 'AN', 'Terminal environment code', 1, '5'),
('900', 'PIN Capability', 1, 'AN', 'PIN capability indicator', 1, '5'),
('901-920', 'Filler', 20, 'AN', 'Reserved', 0, '5'),

-- TAB 6: Acceptor Codes
('921-935', 'V/MC Acceptor ID Code', 15, 'AN', 'Visa/MC acceptor ID code', 1, '6'),
('936-950', 'Filler', 15, 'AN', 'Reserved', 0, '6'),
('951-958', 'V/MC Terminal ID Code', 8, 'AN', 'Visa/MC terminal ID code', 1, '6'),
('959-1050', 'Filler', 92, 'AN', 'Reserved', 0, '6'),

-- TAB 7: Network and Processing Information
('1051-1054', 'Daily Deposit Cutoff Time', 4, 'N', 'Daily deposit cutoff time in HHMM format', 1, '7'),
('1055-1069', 'AMEX Number', 15, 'AN', 'AMEX merchant number', 1, '7'),
('1070-1079', 'AMEX SE Number', 10, 'AN', 'AMEX SE number', 1, '7'),
('1080-1085', 'AMEX Chain Number', 6, 'N', 'AMEX chain number', 1, '7'),
('1086-1121', 'Filler', 36, 'AN', 'Reserved', 0, '7'),
('1122-1146', 'V/MC Merchant Name', 25, 'AN', 'Visa/MC merchant name for processing', 1, '7'),
('1147-1159', 'V/MC Merchant City', 13, 'AN', 'Visa/MC merchant city for processing', 1, '7'),
('1160-1161', 'V/MC Merchant State', 2, 'AN', 'Visa/MC merchant state for processing', 1, '7'),
('1162-1171', 'V/MC Merchant Postal', 10, 'AN', 'Visa/MC merchant postal code for processing', 1, '7'),
('1172-1174', 'V/MC Merchant Country', 3, 'AN', 'Visa/MC merchant country code', 1, '7'),
('1175-1184', 'V/MC Merchant Phone', 10, 'N', 'Visa/MC merchant phone number', 1, '7'),
('1185-1234', 'V/MC URL', 50, 'AN', 'Visa/MC merchant website URL', 1, '7'),
('1235-1264', 'AMEX Merchant Name', 30, 'AN', 'AMEX merchant name for processing', 1, '7'),
('1265-1284', 'AMEX Merchant City', 20, 'AN', 'AMEX merchant city for processing', 1, '7'),
('1285-1287', 'AMEX Merchant State', 3, 'AN', 'AMEX merchant state for processing', 1, '7'),
('1288-1296', 'AMEX Merchant Postal', 9, 'AN', 'AMEX merchant postal code for processing', 1, '7'),
('1297-1312', 'AMEX Merchant Phone', 16, 'N', 'AMEX merchant phone number', 1, '7'),
('1313-1362', 'AMEX URL', 50, 'AN', 'AMEX merchant website URL', 1, '7'),
('1363-1469', 'Filler', 107, 'AN', 'Reserved for future use', 0, '7'),
('1470-1577', 'RESERVED/UNUSED', 108, 'AN', 'Reserved/Unused space', 0, '7')

ON CONFLICT (position) DO UPDATE SET
  field_name = EXCLUDED.field_name,
  field_length = EXCLUDED.field_length,
  format = EXCLUDED.format,
  description = EXCLUDED.description,
  mms_enabled = EXCLUDED.mms_enabled,
  tab_position = EXCLUDED.tab_position,
  updated_at = NOW();
