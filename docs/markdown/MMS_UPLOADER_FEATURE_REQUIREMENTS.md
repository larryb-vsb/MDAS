
# MMS Uploader Feature Requirements Document

## 1. Overview

### 1.1 Purpose
The MMS Uploader feature provides a dedicated interface for uploading and processing various file types with enhanced processing capabilities, real-time status tracking, and comprehensive file management. This feature operates independently from other system pages unless explicitly requested to integrate.

### 1.2 Scope
This document defines the requirements for the MMS Uploader feature, including file processing states, user interface specifications, data models, and technical implementation details.

## 2. File Processing States

Files progress through the following states during processing:

1. **Started**: File name and metadata captured with start time
2. **Uploading**: File transfer in progress
3. **Uploaded**: File successfully transferred to server
4. **Identified**: File analyzed, lines counted, final data size recorded
5. **Encoding**: JSON processing to new JSON table, including field separation, raw line data, processing times, errors, source file name, and other metadata from previous steps
6. **Processing**: JSON to database conversion for:
   - Merchant records
   - TDDF records
   - Terminal records
   - Risk Files
   - MasterCard Data Integrity records
7. **Completed**: All processing finished successfully
8. **Warning State**: Unidentified file - user will need to fix on upload screen

## 3. User Interface Requirements

### 3.1 Upload Interface
- Dedicated upload page separate from other system pages
- Drag-and-drop file upload capability
- Multiple file selection support
- File type validation and preview
- Upload progress indicators
- Real-time status updates

### 3.2 Processing Dashboard
- Live processing status display
- File queue management interface
- Processing history and tracking
- Error reporting and resolution tools
- Batch upload capabilities

### 3.3 Status Monitoring
- Real-time processing status updates
- Detailed upload history and tracking
- Processing queue management
- Enhanced error handling and user feedback

## 4. Technical Requirements

### 4.1 File Processing
- Support for multiple file types with automatic detection
- File classification and type detection
- Background processing to prevent timeouts
- Processing queue management
- Automatic retry mechanisms for failed uploads

### 4.2 Data Storage
All uploader processing tables use the prefix `uploader_`:

#### 4.2.1 Core Tables

##### uploader_uploads
- ID (string, primary key)
- Filename
- Compressed Payload (JSONB)
- Schema Info (JSONB)
- Upload Date
- Status
- Processed At
- Record Count
- Processing Time (ms)
- Notes

##### uploader_json
- ID (primary key)
- Upload ID (foreign key)
- Raw Line Data
- Processed JSON (JSONB)
- Field Separation Data (JSONB)
- Processing Time (ms)
- Errors (JSONB)
- Source File Name
- Metadata (JSONB)

##### uploader_tddf_jsonb_records
- ID (primary key)
- Upload ID (foreign key)
- Record Type
- Record Data (JSONB)
- Processing Status
- Created At
- Updated At

##### uploader_mastercard_di_edit_records
- ID (primary key)
- Upload ID (foreign key)
- Edit Data (JSONB with variable length fields)
- Edit Numbers (JSONB array)
- Processing Status
- Created At
- Updated At

### 4.3 Processing Architecture
- Multi-stream upload capabilities via PowerShell-based local agent
- Database-level concurrency control
- Atomic file claiming to prevent conflicts
- Processing status tracking through queued → processing → completed/failed states
- Server attribution for multi-node environments

## 5. Integration Requirements

### 5.1 System Integration
- Non-interference with other system pages unless requested
- API endpoints for status monitoring
- Integration with existing MMS database schema
- Compatibility with current authentication system

### 5.2 Data Flow
- POST BH (Batch Header) records first
- Process DT (Detail Transaction) records with batch references
- Handle P1/P2 (Purchasing Extension) records with transaction references
- Process other record types to catch-all tables

## 6. Performance Requirements

### 6.1 Upload Performance
- Support for large file uploads with chunking
- Concurrent processing capabilities
- Optimized database operations
- Real-time progress tracking

### 6.2 Processing Performance
- Batch processing optimization
- Queue management efficiency
- Resource utilization monitoring
- Scalable architecture for high-volume processing

## 7. Error Handling

### 7.1 Upload Errors
- File validation errors
- Network interruption recovery
- Duplicate file detection
- Size limit enforcement

### 7.2 Processing Errors
- Data format validation
- Record parsing errors
- Database constraint violations
- Recovery and retry mechanisms

## 8. Security Requirements

### 8.1 File Security
- File type validation
- Size limitations
- Virus scanning (if applicable)
- Secure file storage

### 8.2 Data Security
- Encrypted data storage
- Access control
- Audit logging
- Data retention policies

## 9. Monitoring and Reporting

### 9.1 Real-time Monitoring
- Processing queue status
- Performance metrics
- Error rate tracking
- System resource utilization

### 9.2 Reporting
- Upload success/failure rates
- Processing performance reports
- Error analysis and trends
- Historical data analysis

## 10. Future Enhancements

### 10.1 Planned Features
- Advanced file format support
- Machine learning for file classification
- Automated data validation rules
- Enhanced analytics and reporting

### 10.2 Scalability Considerations
- Horizontal scaling support
- Load balancing capabilities
- Distributed processing architecture
- Cloud storage integration

---

**Document Version**: 1.0  
**Last Updated**: January 28, 2025  
**Status**: Draft - Pending Implementation
