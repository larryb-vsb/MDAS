import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';

interface ColumnInfo {
  column_name: string;
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

interface IndexInfo {
  indexname: string;
  indexdef: string;
}

interface TableComparison {
  table: string;
  status: 'match' | 'different' | 'dev_only' | 'prod_only';
  devColumns: ColumnInfo[];
  prodColumns: ColumnInfo[];
  columnDiffs: ColumnDiff[];
  indexDiffs: IndexDiff[];
}

interface ColumnDiff {
  column: string;
  status: 'match' | 'different' | 'dev_only' | 'prod_only' | 'renamed';
  devInfo?: ColumnInfo;
  prodInfo?: ColumnInfo;
  possibleProdMatch?: string;
  differences?: string[];
}

interface IndexDiff {
  indexName: string;
  status: 'match' | 'different' | 'dev_only' | 'prod_only';
  devDef?: string;
  prodDef?: string;
}

interface SanityReport {
  timestamp: string;
  summary: {
    totalDevTables: number;
    totalProdTables: number;
    matchingTables: number;
    tablesWithDiffs: number;
    devOnlyTables: number;
    prodOnlyTables: number;
    totalColumnDiffs: number;
  };
  tables: TableComparison[];
  columnMappings: Record<string, Record<string, string>>;
}

async function runSanityCheck(): Promise<SanityReport> {
  console.log('🔍 Running complete schema sanity check between dev and prod...\n');

  const devSql = neon(process.env.DATABASE_URL!);
  const prodSql = neon(process.env.NEON_PROD_DATABASE_URL!);

  const devTables = await devSql(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT LIKE 'drizzle%'
    AND tablename NOT LIKE 'pg_%'
    ORDER BY tablename
  `);

  const prodTables = await prodSql(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT LIKE 'drizzle%'
    AND tablename NOT LIKE 'pg_%'
    ORDER BY tablename
  `);

  const devTableNames = new Set(devTables.map(r => r.tablename));
  const prodTableNames = new Set(prodTables.map(r => r.tablename));

  const devNonDevTables = [...devTableNames].filter(t => !t.startsWith('dev_'));
  const prodNonDevTables = [...prodTableNames].filter(t => !t.startsWith('dev_'));

  const devProdMapping: Record<string, string> = {};
  for (const devTable of devTableNames) {
    if (devTable.startsWith('dev_')) {
      const prodEquiv = devTable.replace(/^dev_/, '');
      if (prodTableNames.has(prodEquiv)) {
        devProdMapping[devTable] = prodEquiv;
      }
    }
  }

  console.log(`📊 Dev tables: ${devTableNames.size} (${Object.keys(devProdMapping).length} dev_* with prod equivalents)`);
  console.log(`📊 Prod tables: ${prodTableNames.size}`);
  console.log('');

  const tableComparisons: TableComparison[] = [];
  const columnMappings: Record<string, Record<string, string>> = {};

  for (const [devTable, prodTable] of Object.entries(devProdMapping)) {
    console.log(`\n📋 Comparing: ${devTable} ↔ ${prodTable}`);

    const devColumnsRaw = await devSql(`
      SELECT 
        column_name,
        data_type,
        udt_name,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        is_nullable,
        column_default,
        ordinal_position
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [devTable]);
    const devColumns = devColumnsRaw as ColumnInfo[];

    const prodColumnsRaw = await prodSql(`
      SELECT 
        column_name,
        data_type,
        udt_name,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        is_nullable,
        column_default,
        ordinal_position
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [prodTable]);
    const prodColumns = prodColumnsRaw as ColumnInfo[];

    const devIndexesRaw = await devSql(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = $1 AND schemaname = 'public'
    `, [devTable]);
    const devIndexes = devIndexesRaw as IndexInfo[];

    const prodIndexesRaw = await prodSql(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = $1 AND schemaname = 'public'
    `, [prodTable]);
    const prodIndexes = prodIndexesRaw as IndexInfo[];

    const columnDiffs = compareColumns(devColumns, prodColumns, prodTable);
    const indexDiffs = compareIndexes(devIndexes, prodIndexes, devTable, prodTable);

    const tableMapping: Record<string, string> = {};
    for (const diff of columnDiffs) {
      if (diff.status === 'renamed' && diff.possibleProdMatch) {
        tableMapping[diff.column] = diff.possibleProdMatch;
      }
    }
    if (Object.keys(tableMapping).length > 0) {
      columnMappings[prodTable] = tableMapping;
    }

    const hasDiffs = columnDiffs.some(d => d.status !== 'match') || 
                     indexDiffs.some(d => d.status !== 'match');

    tableComparisons.push({
      table: prodTable,
      status: hasDiffs ? 'different' : 'match',
      devColumns,
      prodColumns,
      columnDiffs,
      indexDiffs
    });

    const diffCount = columnDiffs.filter(d => d.status !== 'match').length;
    const indexDiffCount = indexDiffs.filter(d => d.status !== 'match').length;
    
    if (diffCount === 0 && indexDiffCount === 0) {
      console.log(`  ✅ Perfect match`);
    } else {
      console.log(`  ⚠️  ${diffCount} column diff(s), ${indexDiffCount} index diff(s)`);
    }
  }

  const devOnlyTables = [...devTableNames].filter(t => 
    !t.startsWith('dev_') && !prodTableNames.has(t)
  );
  const prodOnlyTables = [...prodTableNames].filter(t => 
    !t.startsWith('dev_') && !devTableNames.has(t) && !devTableNames.has('dev_' + t)
  );

  for (const table of devOnlyTables) {
    tableComparisons.push({
      table,
      status: 'dev_only',
      devColumns: [],
      prodColumns: [],
      columnDiffs: [],
      indexDiffs: []
    });
  }

  for (const table of prodOnlyTables) {
    tableComparisons.push({
      table,
      status: 'prod_only',
      devColumns: [],
      prodColumns: [],
      columnDiffs: [],
      indexDiffs: []
    });
  }

  const report: SanityReport = {
    timestamp: new Date().toISOString(),
    summary: {
      totalDevTables: devTableNames.size,
      totalProdTables: prodTableNames.size,
      matchingTables: tableComparisons.filter(t => t.status === 'match').length,
      tablesWithDiffs: tableComparisons.filter(t => t.status === 'different').length,
      devOnlyTables: devOnlyTables.length,
      prodOnlyTables: prodOnlyTables.length,
      totalColumnDiffs: tableComparisons.reduce((sum, t) => 
        sum + t.columnDiffs.filter(d => d.status !== 'match').length, 0
      )
    },
    tables: tableComparisons,
    columnMappings
  };

  return report;
}

function compareColumns(
  devCols: ColumnInfo[], 
  prodCols: ColumnInfo[],
  prodTable: string
): ColumnDiff[] {
  const diffs: ColumnDiff[] = [];
  const devColMap = new Map(devCols.map(c => [c.column_name, c]));
  const prodColMap = new Map(prodCols.map(c => [c.column_name, c]));
  const matchedProdCols = new Set<string>();

  for (const devCol of devCols) {
    const prodCol = prodColMap.get(devCol.column_name);
    
    if (prodCol) {
      matchedProdCols.add(devCol.column_name);
      const differences = findColumnDifferences(devCol, prodCol);
      diffs.push({
        column: devCol.column_name,
        status: differences.length === 0 ? 'match' : 'different',
        devInfo: devCol,
        prodInfo: prodCol,
        differences
      });
    } else {
      const possibleMatch = findPossibleRename(devCol, prodCols, matchedProdCols);
      if (possibleMatch) {
        matchedProdCols.add(possibleMatch);
        diffs.push({
          column: devCol.column_name,
          status: 'renamed',
          devInfo: devCol,
          prodInfo: prodColMap.get(possibleMatch),
          possibleProdMatch: possibleMatch,
          differences: [`Likely renamed: ${devCol.column_name} → ${possibleMatch}`]
        });
      } else {
        diffs.push({
          column: devCol.column_name,
          status: 'dev_only',
          devInfo: devCol,
          differences: ['Column exists in dev but not in prod']
        });
      }
    }
  }

  for (const prodCol of prodCols) {
    if (!matchedProdCols.has(prodCol.column_name) && !devColMap.has(prodCol.column_name)) {
      diffs.push({
        column: prodCol.column_name,
        status: 'prod_only',
        prodInfo: prodCol,
        differences: ['Column exists in prod but not in dev']
      });
    }
  }

  return diffs;
}

function findColumnDifferences(devCol: ColumnInfo, prodCol: ColumnInfo): string[] {
  const diffs: string[] = [];
  
  if (normalizeType(devCol) !== normalizeType(prodCol)) {
    diffs.push(`Type: dev=${normalizeType(devCol)}, prod=${normalizeType(prodCol)}`);
  }
  
  if (devCol.is_nullable !== prodCol.is_nullable) {
    diffs.push(`Nullable: dev=${devCol.is_nullable}, prod=${prodCol.is_nullable}`);
  }
  
  return diffs;
}

function normalizeType(col: ColumnInfo): string {
  if (col.data_type === 'ARRAY') {
    return col.udt_name.replace(/^_/, '') + '[]';
  }
  if (col.data_type === 'character varying') {
    return col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'varchar';
  }
  if (col.data_type === 'USER-DEFINED') {
    return col.udt_name;
  }
  return col.data_type;
}

function findPossibleRename(
  devCol: ColumnInfo, 
  prodCols: ColumnInfo[],
  alreadyMatched: Set<string>
): string | null {
  const unmatchedProd = prodCols.filter(p => !alreadyMatched.has(p.column_name));
  
  for (const prodCol of unmatchedProd) {
    if (normalizeType(devCol) === normalizeType(prodCol) &&
        devCol.is_nullable === prodCol.is_nullable &&
        Math.abs(devCol.ordinal_position - prodCol.ordinal_position) <= 2) {
      const devName = devCol.column_name.toLowerCase();
      const prodName = prodCol.column_name.toLowerCase();
      
      if (devName.includes('date') && prodName.includes('at') ||
          devName.includes('datetime') && prodName.includes('at') ||
          devName.includes('status') && prodName.includes('status') ||
          devName.includes('pipeline') && prodName.includes('status') ||
          devName.includes('ip') && prodName.includes('ip') ||
          devName.includes('upload') && prodName.includes('source') ||
          levenshteinSimilarity(devName, prodName) > 0.5) {
        return prodCol.column_name;
      }
    }
  }
  return null;
}

function levenshteinSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  
  const costs: number[] = [];
  for (let i = 0; i <= shorter.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= longer.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (shorter.charAt(i - 1) !== longer.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[longer.length] = lastValue;
  }
  return (longer.length - costs[longer.length]) / longer.length;
}

function compareIndexes(
  devIndexes: IndexInfo[],
  prodIndexes: IndexInfo[],
  devTable: string,
  prodTable: string
): IndexDiff[] {
  const diffs: IndexDiff[] = [];
  
  const normalizeIndexDef = (def: string, fromTable: string, toTable: string) => {
    return def
      .replace(new RegExp(fromTable, 'g'), toTable)
      .replace(/\s+/g, ' ')
      .trim();
  };

  const devIndexMap = new Map(devIndexes.map(i => [
    i.indexname.replace(devTable, prodTable),
    normalizeIndexDef(i.indexdef, devTable, prodTable)
  ]));

  const prodIndexMap = new Map(prodIndexes.map(i => [
    i.indexname,
    i.indexdef
  ]));

  for (const [indexName, devDef] of devIndexMap) {
    const prodDef = prodIndexMap.get(indexName);
    if (prodDef) {
      if (normalizeIndexDef(devDef, devTable, prodTable) === normalizeIndexDef(prodDef, prodTable, prodTable)) {
        diffs.push({ indexName, status: 'match', devDef, prodDef });
      } else {
        diffs.push({ indexName, status: 'different', devDef, prodDef });
      }
    } else {
      diffs.push({ indexName, status: 'dev_only', devDef });
    }
  }

  for (const [indexName, prodDef] of prodIndexMap) {
    if (!devIndexMap.has(indexName)) {
      diffs.push({ indexName, status: 'prod_only', prodDef });
    }
  }

  return diffs;
}

function generateReport(report: SanityReport): string {
  let md = `# Schema Sanity Check Report\n\n`;
  md += `**Generated:** ${report.timestamp}\n\n`;
  
  md += `## Summary\n\n`;
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Dev Tables | ${report.summary.totalDevTables} |\n`;
  md += `| Prod Tables | ${report.summary.totalProdTables} |\n`;
  md += `| Matching Tables | ${report.summary.matchingTables} |\n`;
  md += `| Tables with Differences | ${report.summary.tablesWithDiffs} |\n`;
  md += `| Dev-Only Tables | ${report.summary.devOnlyTables} |\n`;
  md += `| Prod-Only Tables | ${report.summary.prodOnlyTables} |\n`;
  md += `| Total Column Differences | ${report.summary.totalColumnDiffs} |\n\n`;

  if (Object.keys(report.columnMappings).length > 0) {
    md += `## Detected Column Mappings (Dev → Prod)\n\n`;
    md += `These columns appear to be renamed between environments:\n\n`;
    md += `| Table | Dev Column | Prod Column |\n`;
    md += `|-------|-----------|-------------|\n`;
    for (const [table, mappings] of Object.entries(report.columnMappings)) {
      for (const [devCol, prodCol] of Object.entries(mappings)) {
        md += `| ${table} | ${devCol} | ${prodCol} |\n`;
      }
    }
    md += `\n`;
  }

  const tablesWithDiffs = report.tables.filter(t => t.status === 'different');
  if (tablesWithDiffs.length > 0) {
    md += `## Tables with Differences\n\n`;
    for (const table of tablesWithDiffs) {
      md += `### ${table.table}\n\n`;
      
      const colDiffs = table.columnDiffs.filter(d => d.status !== 'match');
      if (colDiffs.length > 0) {
        md += `**Column Differences:**\n\n`;
        md += `| Column | Status | Details |\n`;
        md += `|--------|--------|----------|\n`;
        for (const diff of colDiffs) {
          const details = diff.differences?.join('; ') || '';
          md += `| ${diff.column} | ${diff.status} | ${details} |\n`;
        }
        md += `\n`;
      }

      const idxDiffs = table.indexDiffs.filter(d => d.status !== 'match');
      if (idxDiffs.length > 0) {
        md += `**Index Differences:**\n\n`;
        for (const diff of idxDiffs) {
          md += `- \`${diff.indexName}\`: ${diff.status}\n`;
        }
        md += `\n`;
      }
    }
  }

  const devOnly = report.tables.filter(t => t.status === 'dev_only');
  const prodOnly = report.tables.filter(t => t.status === 'prod_only');
  
  if (devOnly.length > 0) {
    md += `## Dev-Only Tables\n\n`;
    for (const t of devOnly) {
      md += `- ${t.table}\n`;
    }
    md += `\n`;
  }

  if (prodOnly.length > 0) {
    md += `## Prod-Only Tables\n\n`;
    for (const t of prodOnly) {
      md += `- ${t.table}\n`;
    }
    md += `\n`;
  }

  return md;
}

function generateCompatMap(report: SanityReport): string {
  let ts = `export const schemaCompatMap = {\n`;
  
  for (const [table, mappings] of Object.entries(report.columnMappings)) {
    ts += `  ${table}: {\n`;
    for (const [devCol, prodCol] of Object.entries(mappings)) {
      ts += `    ${devCol}: '${prodCol}',\n`;
    }
    ts += `  },\n`;
  }
  
  ts += `} as const;\n\n`;
  ts += `export type TableName = keyof typeof schemaCompatMap;\n\n`;
  ts += `export function mapColumnName(table: string, devColumn: string): string {\n`;
  ts += `  const tableMap = schemaCompatMap[table as TableName];\n`;
  ts += `  if (tableMap && devColumn in tableMap) {\n`;
  ts += `    return tableMap[devColumn as keyof typeof tableMap];\n`;
  ts += `  }\n`;
  ts += `  return devColumn;\n`;
  ts += `}\n`;
  
  return ts;
}

async function main() {
  try {
    const report = await runSanityCheck();
    
    const jsonPath = 'scripts/analysis/schema-sanity-report.json';
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 JSON report: ${jsonPath}`);
    
    const mdReport = generateReport(report);
    const mdPath = 'scripts/analysis/schema-sanity-report.md';
    fs.writeFileSync(mdPath, mdReport);
    console.log(`📄 Markdown report: ${mdPath}`);
    
    const compatMap = generateCompatMap(report);
    const compatPath = 'scripts/schema-compat-map.ts';
    fs.writeFileSync(compatPath, compatMap);
    console.log(`📄 Compatibility map: ${compatPath}`);
    
    console.log(`\n========================================`);
    console.log(`📊 SUMMARY`);
    console.log(`========================================`);
    console.log(`Matching tables: ${report.summary.matchingTables}`);
    console.log(`Tables with differences: ${report.summary.tablesWithDiffs}`);
    console.log(`Dev-only tables: ${report.summary.devOnlyTables}`);
    console.log(`Prod-only tables: ${report.summary.prodOnlyTables}`);
    console.log(`Total column differences: ${report.summary.totalColumnDiffs}`);
    console.log(`Column mappings detected: ${Object.keys(report.columnMappings).length} tables`);
    
  } catch (error) {
    console.error('Error running sanity check:', error);
    process.exit(1);
  }
}

main();
