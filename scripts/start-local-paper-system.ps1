param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = "C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$vinextCli = Join-Path $projectRoot "node_modules\vinext\dist\cli.js"
$runtimeDir = Join-Path $projectRoot ".codex-artifacts\runtime"
$stdoutLog = Join-Path $runtimeDir "paper-system.stdout.log"
$stderrLog = Join-Path $runtimeDir "paper-system.stderr.log"
$pidFile = Join-Path $runtimeDir "paper-system.pid"
$testUrl = "http://localhost:3000"

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Codex Node.js runtime not found: $nodePath"
}
if (-not (Test-Path -LiteralPath $vinextCli)) {
  throw "Project dependency not found: $vinextCli"
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
function Test-PaperSystem {
  try {
    $response = Invoke-WebRequest -Uri "$testUrl/login" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content.Contains("ScholarFlow")
  } catch {
    return $false
  }
}

if (-not (Test-PaperSystem)) {
  $command = '"{0}" "{1}" dev --host localhost --port 3000 1>>"{2}" 2>>"{3}"' -f $nodePath, $vinextCli, $stdoutLog, $stderrLog
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = "$env:SystemRoot\System32\cmd.exe"
  $startInfo.Arguments = "/d /s /c `"$command`""
  $startInfo.WorkingDirectory = $projectRoot
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $startInfo.EnvironmentVariables["M5_LOCAL_OBJECT_STORAGE"] = "true"
  $startInfo.EnvironmentVariables["WRANGLER_WRITE_LOGS"] = "false"
  $process = [System.Diagnostics.Process]::Start($startInfo)
  if (-not $process) {
    throw "Unable to start the ScholarFlow background process."
  }
  Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii
}

$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
  if (Test-PaperSystem) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 500
}
if (-not $ready) {
  throw "ScholarFlow did not start within 20 seconds. Check: $stderrLog"
}

if (-not $NoBrowser) {
  Start-Process $testUrl
}

Write-Output "READY $testUrl"
