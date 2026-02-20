param(
  [Parameter(Mandatory = $true)]
  [string]$CsvPath,
  [string]$MySqlPassword = "strongpassword",
  [string]$ComposeFile = "docker-compose.yaml",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Normalize-WhatsappNumber([string]$raw) {
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  $digits = ($raw -replace "\D", "")
  if ([string]::IsNullOrWhiteSpace($digits)) { return $null }

  if ($digits.StartsWith("0") -and $digits.Length -ge 13) {
    $candidateCarrier = if ($digits.Length -ge 14) { $digits.Substring(3) } else { $null }
    if ($candidateCarrier -and $candidateCarrier.Length -in 10, 11) {
      $digits = $candidateCarrier
    } else {
      $digits = $digits.TrimStart("0")
    }
  }

  $national = $digits
  if ($national.StartsWith("55") -and $national.Length -gt 2) {
    $national = $national.Substring(2)
  }
  if ($national -match "^(0800|800|0300|3003|4004|0500)") { return $null }

  if ($digits.StartsWith("55")) {
    if ($digits.Length -in 12, 13) { return $digits }
    if ($digits.Length -gt 13 -and $digits[2] -eq "0") {
      $digits = "55" + $digits.Substring(3)
      if ($digits.Length -in 12, 13) { return $digits }
    }
  }

  if ($digits.Length -in 10, 11) { return "55$digits" }

  if ($digits.Length -ge 11 -and $digits.Length -le 15 -and -not $digits.StartsWith("0")) {
    return $digits
  }

  return $null
}

function SqlEscape([string]$s) {
  if ($null -eq $s) { return "" }
  return ($s -replace "\\", "\\\\" -replace "'", "''")
}

if (-not (Test-Path $CsvPath)) {
  throw "Arquivo nao encontrado: $CsvPath"
}

$root = Get-Location
$tmpDir = Join-Path $root "tmp"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
$sqlPath = Join-Path $tmpDir "import_contacts.sql"
$previewPath = Join-Path $tmpDir "contacts_normalized_preview.csv"

$rows = Import-Csv $CsvPath -Encoding UTF8

$seen = @{}
$contacts = New-Object System.Collections.Generic.List[object]
$invalid = 0
$duplicateCsv = 0

foreach ($r in $rows) {
  $rawPhone = if (-not [string]::IsNullOrWhiteSpace($r."Phone 1 - Value")) { $r."Phone 1 - Value" } else { $r."Phone 2 - Value" }
  $number = Normalize-WhatsappNumber $rawPhone
  if (-not $number) { $invalid++; continue }

  if ($seen.ContainsKey($number)) { $duplicateCsv++; continue }
  $seen[$number] = $true

  $nameParts = @($r."First Name", $r."Middle Name", $r."Last Name") |
    ForEach-Object { if ($_){ $_.Trim() } } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $name = ($nameParts -join " ").Trim()
  if ([string]::IsNullOrWhiteSpace($name)) { $name = ($r."Organization Name").Trim() }
  if ([string]::IsNullOrWhiteSpace($name)) { $name = ($r.Nickname).Trim() }
  if ([string]::IsNullOrWhiteSpace($name)) { $name = $number }

  $email = ""
  if (-not [string]::IsNullOrWhiteSpace($r."E-mail 1 - Value")) {
    $candidate = $r."E-mail 1 - Value".Trim()
    if ($candidate -match "@") { $email = $candidate }
  }

  $contacts.Add([PSCustomObject]@{
    name = $name
    number = $number
    email = $email
  })
}

$contacts | Select-Object name, number, email | Export-Csv -Path $previewPath -NoTypeInformation -Encoding UTF8

"total_csv=$($rows.Count)"
"normalized_valid=$($contacts.Count)"
"discarded_invalid=$invalid"
"discarded_duplicate_in_csv=$duplicateCsv"
"preview_file=$previewPath"

if ($DryRun) {
  "dry_run=true (nenhum insert executado)"
  exit 0
}

$before = docker compose -f $ComposeFile exec -T mysql mysql -N -uroot -p$MySqlPassword -D whaticket -e "select count(*) from Contacts;"
$beforeCount = [int]($before | Select-Object -Last 1)

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("SET NAMES utf8mb4;")
$batchSize = 300

for ($i = 0; $i -lt $contacts.Count; $i += $batchSize) {
  $batch = $contacts[$i..([Math]::Min($i + $batchSize - 1, $contacts.Count - 1))]
  $values = @()
  foreach ($c in $batch) {
    $name = SqlEscape $c.name
    $number = SqlEscape $c.number
    $email = SqlEscape $c.email
    $values += "('$name','$number','$email',0,NOW(),NOW())"
  }
  $lines.Add("INSERT IGNORE INTO Contacts (name, number, email, isGroup, createdAt, updatedAt) VALUES " + ($values -join ",") + ";")
}

Set-Content -Path $sqlPath -Value ($lines -join "`n") -Encoding UTF8
Get-Content $sqlPath | docker compose -f $ComposeFile exec -T mysql mysql -uroot -p$MySqlPassword -D whaticket

$after = docker compose -f $ComposeFile exec -T mysql mysql -N -uroot -p$MySqlPassword -D whaticket -e "select count(*) from Contacts;"
$afterCount = [int]($after | Select-Object -Last 1)
$inserted = $afterCount - $beforeCount

"contacts_before=$beforeCount"
"contacts_after=$afterCount"
"inserted_now=$inserted"
"sql_file=$sqlPath"
