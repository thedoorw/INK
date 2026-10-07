const clone = value => JSON.parse(JSON.stringify(value));

export const SECURITY_RULES = Object.freeze([
  { id: 'FILESYSTEM_WRITE', severity: 'BLOCK', pattern: /\b(writeFile|unlink|remove|rmdir|mkdir|File\.saveDialog|saveAs|open\s*\([^)]*['\"]w|os\.remove|shutil\.)\b/i, message: '任意或未申報檔案系統寫入' },
  { id: 'NETWORK', severity: 'BLOCK', pattern: /\b(fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|requests\.|urllib\.|socket\.|curl\b|wget\b|importScripts\s*\(|(?:script|img|image)\.src\s*=)/i, message: '未申報網路連線' },
  { id: 'SHELL', severity: 'BLOCK', pattern: /\b(child_process|execSync|spawnSync|subprocess\.|os\.system|powershell|cmd\.exe|command\.com|WScript\.Shell|ShellExecute)\b/i, message: 'Shell／PowerShell／Command Prompt 呼叫' },
  { id: 'SYSTEM_SETTINGS', severity: 'BLOCK', pattern: /\b(regedit|registry|defaults\s+write|sysctl|SystemParametersInfo|HKCU|HKLM)\b/i, message: '修改系統設定' },
  { id: 'DYNAMIC_DOWNLOAD', severity: 'BLOCK', pattern: /\b(download|eval\s*\(|new\s+Function\s*\(|execfile\s*\(|importlib\.import_module)\b/i, message: '下載、動態載入或執行其他程式' },
  { id: 'OBFUSCATION', severity: 'BLOCK', pattern: /\b(fromCharCode|atob\s*\(|base64\.b64decode|unescape\s*\(|charCodeAt).*\b(eval|Function)\b/i, message: '隱藏或混淆程式碼' },
  { id: 'BINARY_LOAD', severity: 'BLOCK', pattern: /\b(LoadLibrary|dlopen|ctypes\.|\.dll\b|\.dylib\b|\.so\b)\b/i, message: '可疑外掛或二進位載入' },
  { id: 'FILE_READ', severity: 'REVIEW', pattern: /\b(readFile|File\.openDialog|open\s*\(|os\.listdir|Path\s*\()\b/i, message: '檔案系統讀取需限定於使用者選取資產' },
  { id: 'USER_DIALOG', severity: 'INFO', pattern: /\b(alert|confirm|prompt|Window\s*\(|Dialog|File\.openDialog|Folder\.selectDialog)\b/i, message: '需要使用者互動' },
  { id: 'RANDOMNESS', severity: 'INFO', pattern: /\b(Math\.random|random\.|rand\s*\(|noise\s*\()\b/i, message: '來源包含非決定性行為，需固定種子或標示' }
]);

export function scanSecurity({ text = '', bytes = null, declaredPermissions = [], license = null, provenance = null } = {}) {
  const findings = [];
  for (const rule of SECURITY_RULES) {
    const match = String(text).match(rule.pattern);
    if (match) findings.push({ ruleId: rule.id, severity: rule.severity, message: rule.message, evidence: match[0].slice(0, 120), offset: match.index });
  }
  if (bytes && bytes.byteLength > 0 && !text) findings.push({ ruleId: 'OPAQUE_BINARY', severity: 'REVIEW', message: '二進位內容只能靜態識別，不能直接執行', evidence: `${bytes.byteLength} bytes`, offset: 0 });
  if (!license?.spdx && !license?.text && !license?.url) findings.push({ ruleId: 'LICENSE_UNCONFIRMED', severity: 'BLOCK', message: '無法確認授權', evidence: 'missing license metadata', offset: null });
  if (!provenance?.sourceUrl && !provenance?.localUserProvided) findings.push({ ruleId: 'SOURCE_UNCONFIRMED', severity: 'BLOCK', message: '無法確認來源', evidence: 'missing provenance', offset: null });
  const permissionFindings = findings.filter(item => item.severity === 'BLOCK' && !declaredPermissions.includes(item.ruleId));
  return {
    format: 'INK-SECURITY-REPORT',
    schemaVersion: 1,
    mode: 'STATIC_PARSE',
    status: permissionFindings.length ? 'REJECTED' : findings.some(item => item.severity === 'REVIEW') ? 'REVIEW_REQUIRED' : 'PASS',
    directExecutionAllowed: false,
    findings,
    blockedBy: permissionFindings.map(item => item.ruleId),
    declaredPermissions: clone(declaredPermissions),
    policy: {
      staticParse: true,
      sandboxAnalysis: true,
      translateOnly: true,
      trustedExternalRun: 'USER_CONFIRMATION_REQUIRED'
    }
  };
}
