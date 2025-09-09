// DIRECT TERMINAL IMPORT - SIMPLE CSV PROCESSING
const csvData = `BIN,POS Merchant #,V Number,DBA Name,Daily Auth Count,Dial Pay Passcode,Encryption,PRR MCC,SSL,Tokenization,Agent,Chain,Store,Terminal #,Merchant Type,Record Status,Board Date,Terminal Visa MCC
400119,0000000051,V0400119,Vermont State B,2000,,,Y,Y,N,000000,000000,0001,0001,FEO,Open,02222022,5999
400119,0000000373,V7967232,Iron Workers Local 63 H,2000,,,Y,Y,N,758000,758002,2285,1101,FS,Open,01102025,8398
400119,0000000373,V5537491,Arch Iron Workers Spec Ev,2000,,,Y,Y,N,758000,758002,2285,1001,FS,Open,01182024,8699
400119,0000000373,V5361629,Arch Iron Workers Local 6,2000,,,Y,Y,N,758000,758002,2285,1001,FS,Open,01182024,8398
400119,0000000373,V5361626,Arch Iron Workers Spec Ev,2000,,,Y,Y,N,758000,758002,2285,1002,FS,Open,01222024,8699
400119,0000000373,V9581536,Arch Iron Workers Local 6,2000,,,Y,Y,N,758000,758002,2285,1003,FS,Open,02232024,8699
400119,0000000787,V5301779,Iron Workers Local 63 H,2000,,,Y,Y,N,758000,758002,2285,2002,FS,Open,01222024,8398
400119,0000000787,V5301339,Iron Workers Local 63 H,2000,,,Y,Y,N,758000,758002,2285,2002,FS,Open,01222024,8398
400119,0000001770255,V2424746,Corridor Pay1,1000,,,Y,Y,N,758000,750001,1001,1001,FS,Open,10092024,7359
400119,0000001770738,V9225203,Corridor Pay2,1000,,,Y,Y,N,758000,750003,7001,1002,FS,Open,10092024,7359`;

const lines = csvData.trim().split('\n');
const headers = lines[0].split(',');

console.log('🚀 DIRECT TERMINAL IMPORT TEST');
console.log(`📋 Headers: ${headers.join(', ')}`);

const vNumberCol = headers.findIndex(h => h === 'V Number');
const posCol = headers.findIndex(h => h === 'POS Merchant #');

console.log(`✅ V Number at column ${vNumberCol}, POS Merchant # at column ${posCol}`);

console.log('\n📝 Sample terminals:');
for (let i = 1; i <= Math.min(3, lines.length - 1); i++) {
  const values = lines[i].split(',');
  console.log(`${i}. V#: ${values[vNumberCol]}, POS#: ${values[posCol]}, DBA: ${values[3]}`);
}

console.log(`\n✅ Total terminals to import: ${lines.length - 1}`);