const koffi = require('koffi');
const { execSync } = require('child_process');

let _winspool = null;
let printerHandle = null;

// Windows API Types
const HANDLE = koffi.pointer('void');
const LPTSTR = 'str';
const DWORD = 'uint32';
const LPDWORD = koffi.pointer('uint32');
const LPBYTE = koffi.pointer('uint8');

// DOC_INFO_1 Structure definition
const DOC_INFO_1 = koffi.struct('DOC_INFO_1', {
  pDocName: 'str',
  pOutputFile: 'str',
  pDatatype: 'str'
});

let _OpenPrinter;
let _ClosePrinter;
let _StartDocPrinter;
let _EndDocPrinter;
let _StartPagePrinter;
let _EndPagePrinter;
let _WritePrinter;

let PRINTER_INFO_4, PRINTER_INFO_1;

function initSdk() {
  if (_winspool) return true;

  try {
    _winspool = koffi.load('winspool.drv');

    _OpenPrinter = _winspool.func('OpenPrinterA', 'int', [LPTSTR, koffi.out(koffi.pointer('void*')), 'void*']);
    _ClosePrinter = _winspool.func('ClosePrinter', 'int', [HANDLE]);
    _StartDocPrinter = _winspool.func('StartDocPrinterA', DWORD, [HANDLE, DWORD, koffi.pointer('DOC_INFO_1')]);
    _EndDocPrinter = _winspool.func('EndDocPrinter', 'int', [HANDLE]);
    _StartPagePrinter = _winspool.func('StartPagePrinter', 'int', [HANDLE]);
    _EndPagePrinter = _winspool.func('EndPagePrinter', 'int', [HANDLE]);
    _WritePrinter = _winspool.func('WritePrinter', 'int', [HANDLE, LPBYTE, DWORD, koffi.out(koffi.pointer('uint32'))]);
    _EnumPrinters = _winspool.func('EnumPrintersA', 'int', [DWORD, LPTSTR, DWORD, LPBYTE, DWORD, LPDWORD, LPDWORD]);

    // Define structs only once
    try {
      PRINTER_INFO_4 = koffi.resolve('PRINTER_INFO_4');
    } catch (e) {
      PRINTER_INFO_4 = koffi.struct('PRINTER_INFO_4', {
        pPrinterName: 'str',
        pServerName: 'str',
        Attributes: 'uint32'
      });
    }

    try {
      PRINTER_INFO_1 = koffi.resolve('PRINTER_INFO_1');
    } catch (e) {
      PRINTER_INFO_1 = koffi.struct('PRINTER_INFO_1', {
        Flags: 'uint32',
        pDescription: 'str',
        pName: 'str',
        pComment: 'str'
      });
    }

    return true;
  } catch (err) {
    console.error("[winspool] Failed to load winspool.drv DLL:", err);
    return false;
  }
}

async function listPrinters() {
  if (!initSdk()) return [];

  // Try different enumeration strategies
  // Level 4 is usually best for local printers on modern Windows
  // Level 1 is a safe fallback
  const strategies = [
    { flags: 0x00000002 | 0x00000004, level: 4, struct: PRINTER_INFO_4 }, // LOCAL | CONNECTIONS
    { flags: 0x00000002, level: 1, struct: PRINTER_INFO_1 }
  ];

  for (const strategy of strategies) {
    try {
      let pcbNeeded = [0];
      let pcReturned = [0];

      console.log(`[winspool] Attempting Scan (Level ${strategy.level}, Flags ${strategy.flags})...`);

      // Initial call for buffer size
      _EnumPrinters(strategy.flags, null, strategy.level, null, 0, pcbNeeded, pcReturned);

      if (pcbNeeded[0] === 0) continue;

      const buffer = Buffer.alloc(pcbNeeded[0]);
      const res = _EnumPrinters(strategy.flags, null, strategy.level, buffer, pcbNeeded[0], pcbNeeded, pcReturned);

      if (res === 0) continue;

      const count = pcReturned[0];
      if (count === 0) continue;

      const printers = [];
      const structSize = koffi.sizeof(strategy.struct);

      for (let i = 0; i < count; i++) {
        const offset = i * structSize;
        
        let namePtr;
        if (strategy.level === 4) {
          // pPrinterName is at offset 0 in PRINTER_INFO_4
          namePtr = process.arch === 'x64' ? buffer.readBigInt64LE(offset) : buffer.readUInt32LE(offset);
        } else {
          // pName is at offset 2*POINTER_SIZE in PRINTER_INFO_1
          const ptrSize = process.arch === 'x64' ? 8 : 4;
          const nameOffset = offset + (ptrSize * 2);
          namePtr = process.arch === 'x64' ? buffer.readBigInt64LE(nameOffset) : buffer.readUInt32LE(nameOffset);
        }

        if (namePtr) {
          const name = koffi.decode(namePtr, 'str');
          if (name && !printers.includes(name)) {
            console.log(`[winspool] Found [L${strategy.level}]: ${name}`);
            printers.push(name);
          }
        }
      }

      if (printers.length > 0) return printers;

    } catch (err) {
      console.warn(`[winspool] WinAPI Strategy Level ${strategy.level} failed:`, err.message);
    }
  }

  // Strategy 2: PowerShell Fallback (Most Reliable)
  const printers = [];
  try {
    console.log("[winspool] Using PowerShell fallback for printer discovery...");
    const cmd = 'powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"';
    const output = execSync(cmd, { encoding: 'utf8' });
    const psPrinters = output.split(/\r?\n/).map(p => p.trim()).filter(p => p.length > 0);
    
    psPrinters.forEach(p => {
      if (!printers.includes(p)) printers.push(p);
    });
  } catch (err) {
    console.error("[winspool] PowerShell fallback failed:", err.message);
  }

  // Strategy 3: WMIC Fallback (Legacy)
  if (printers.length === 0) {
    try {
      console.log("[winspool] Using WMIC fallback for printer discovery...");
      const output = execSync('wmic printer get name', { encoding: 'utf8' });
      const wmicPrinters = output.split(/\r?\n/)
        .map(p => p.trim())
        .filter((p, i) => i > 0 && p.length > 0 && p !== 'Name');
      
      wmicPrinters.forEach(p => {
        if (!printers.includes(p)) printers.push(p);
      });
    } catch (err) {
      console.error("[winspool] WMIC fallback failed:", err.message);
    }
  }

  if (printers.length === 0) {
    console.warn("[winspool] All printer enumeration strategies returned empty list.");
  }
  
  return printers;
}

async function connectPrinter(printerName = "XP-58-P") {
  console.log("[winspool] CONNECT TENDERED TO:", printerName);
  if (!initSdk()) return false;

  try {
    if (printerHandle) {
      _ClosePrinter(printerHandle);
      printerHandle = null;
    }

    // koffi.out array to receive the HANDLE pointer
    let handlePtr = [null];
    
    // Using OpenPrinterA - we pass null for printer defaults mapping
    const res = _OpenPrinter(printerName, handlePtr, null);
    
    if (res === 0 || !handlePtr[0]) {
        console.error(`[winspool] OpenPrinter Failed for ${printerName}. Check if name is exact.`);
        return false;
    }

    printerHandle = handlePtr[0];
    console.log("[winspool] Printer connected successfully to:", printerName);
    return true;
  } catch (err) {
    console.error("[winspool] Exception during connectPrinter:", err);
    return false;
  }
}

function disconnectPrinter() {
  console.log("[winspool] disconnectPrinter called");
  return new Promise((resolve) => {
    if (!printerHandle) return resolve();
    try {
      _ClosePrinter(printerHandle);
      printerHandle = null;
    } catch(err) {
      console.error("[winspool] Exception during disconnect Printer:", err);
    }
    resolve();
  });
}

function printData(bufferData) {
  if (!printerHandle) {
    console.error("[winspool] Cannot print: No printer connected");
    return false;
  }

  try {
    // Decode incoming base64 string from IPC bridge
    const buffer = Buffer.from(bufferData, 'base64');
    const length = buffer.length;

    console.log(`[winspool] Starting Document spool API for ${length} bytes...`);

    // Define RAW document to bypass Windows GDI graphics processing
    const docInfo = {
      pDocName: "Alon POS Receipt",
      pOutputFile: null,
      pDatatype: "RAW"
    };

    const docId = _StartDocPrinter(printerHandle, 1, docInfo);
    if (docId === 0) {
       console.error("[winspool] StartDocPrinter failed.");
       return false;
    }

    _StartPagePrinter(printerHandle);

    let bytesWrittenArr = [0];
    const writeRes = _WritePrinter(printerHandle, buffer, length, bytesWrittenArr);
    
    _EndPagePrinter(printerHandle);
    _EndDocPrinter(printerHandle);

    if (writeRes === 0 || bytesWrittenArr[0] !== length) {
        console.error(`[winspool] WritePrinter Failed. Wrote ${bytesWrittenArr[0]} of ${length} bytes.`);
        return false;
    }

    console.log("[winspool] Successfully flushed raw data to Windows Spooler queue.");
    return true;
  } catch(err) {
    console.error("[winspool] Exception during printData:", err);
    return false;
  }
}

module.exports = {
  listPrinters,
  connectPrinter,
  disconnectPrinter,
  printData
};
