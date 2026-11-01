<#
.SYNOPSIS
    BookLoop Database Backup Script (PowerShell)
    Backs up schema, tables, triggers, and data from Supabase.

.DESCRIPTION
    Requires Supabase DB connection string (available in Supabase Dashboard -> Settings -> Database).
    Example usage:
        $env:DATABASE_URL = "postgresql://postgres:[YOUR-PASSWORD]@db.ofaybxxfymkzceydqfia.supabase.co:5432/postgres"
        .\scripts\backup-db.ps1
#>

param(
    [string]$DbUrl = $env:DATABASE_URL,
    [string]$OutputDir = "./backups"
)

if (-not $DbUrl) {
    Write-Error "DATABASE_URL is not set. Please set the environment variable or pass -DbUrl."
    Write-Host "Example: `$env:DATABASE_URL = 'postgresql://postgres:[PASSWORD]@db.ofaybxxfymkzceydqfia.supabase.co:5432/postgres'"
    exit 1
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutputFile = Join-Path $OutputDir "bookloop_backup_$Timestamp.sql"

Write-Host "Creating database backup to $OutputFile..."
pg_dump --clean --if-exists --no-owner --no-privileges -d $DbUrl -f $OutputFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Backup completed successfully: $OutputFile" -ForegroundColor Green
} else {
    Write-Error "Backup failed with exit code $LASTEXITCODE"
}

