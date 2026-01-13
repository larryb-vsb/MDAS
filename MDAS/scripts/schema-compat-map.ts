export const schemaCompatMap = {
  uploader_uploads: {
    upload_datetime: 'uploaded_at',
    pipeline_status: 'status',
  },
  connection_log: {
    ip_address: 'client_ip',
  },
  uploaded_files: {
    upload_id: 'source_file_id',
    upload_date: 'uploaded_at',
  },
  tddf_records_all_pre_cache: {
    year: 'upload_id',
    cache_key: 'record_type',
  },
  tddf_records_dt_pre_cache: {
    year: 'upload_id',
    cache_key: 'merchant_account',
  },
} as const;

export type TableName = keyof typeof schemaCompatMap;
export type ColumnMapping<T extends TableName> = typeof schemaCompatMap[T];

export function mapColumnName(table: string, devColumn: string): string {
  const tableMap = schemaCompatMap[table as TableName];
  if (tableMap && devColumn in tableMap) {
    return tableMap[devColumn as keyof typeof tableMap];
  }
  return devColumn;
}

export function mapIndexDefinition(
  indexDef: string, 
  devTable: string, 
  prodTable: string
): string {
  let mapped = indexDef.replace(new RegExp(devTable, 'g'), prodTable);
  
  const tableMap = schemaCompatMap[prodTable as TableName];
  if (tableMap) {
    for (const [devCol, prodCol] of Object.entries(tableMap)) {
      mapped = mapped.replace(new RegExp(`\\b${devCol}\\b`, 'g'), prodCol);
    }
  }
  
  return mapped;
}

export function getKnownDifferences(): string {
  return `
Known Column Mappings (Dev → Prod):
===================================
${Object.entries(schemaCompatMap)
  .map(([table, cols]) => 
    `${table}:\n${Object.entries(cols).map(([dev, prod]) => `  - ${dev} → ${prod}`).join('\n')}`
  )
  .join('\n\n')}

Note: These mappings are used by sync scripts to translate 
dev column names to production column names.
`;
}
