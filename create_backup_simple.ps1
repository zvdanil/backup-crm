# Simple backup script for Supabase database
# Works on free plan (no automatic backups)

$projectRef = "qtphickigswerhvintvh"
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupFile = "backup_$timestamp.sql"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Creating Supabase database backup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Project: $projectRef" -ForegroundColor Yellow
Write-Host "Backup file: $backupFile" -ForegroundColor Yellow
Write-Host ""

Write-Host "You need database password to create backup." -ForegroundColor White
Write-Host "Where to find it:" -ForegroundColor White
Write-Host "  1. Open: https://app.supabase.com/project/$projectRef/settings/database" -ForegroundColor Gray
Write-Host "  2. Find Connection string or Database password section" -ForegroundColor Gray
Write-Host "  3. If password is forgotten, click Reset database password" -ForegroundColor Gray
Write-Host ""

$securePassword = Read-Host "Enter database password" -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
)

if ([string]::IsNullOrWhiteSpace($password)) {
    Write-Host ""
    Write-Host "Password cannot be empty!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Creating backup..." -ForegroundColor Yellow

$dbUrl = "postgresql://postgres.$projectRef" + ":" + $password + "@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"

try {
    Write-Host "Attempt 1: Using Supabase CLI..." -ForegroundColor Cyan
    
    $result = npx supabase db dump --db-url $dbUrl --file $backupFile 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Backup created successfully via Supabase CLI!" -ForegroundColor Green
        Write-Host "File: $backupFile" -ForegroundColor Cyan
        $fileSize = (Get-Item $backupFile).Length / 1MB
        Write-Host "Size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan
        Write-Host ""
        exit 0
    } else {
        Write-Host ""
        Write-Host "Supabase CLI requires Docker. Trying alternative method..." -ForegroundColor Yellow
        Write-Host ""
    }
} catch {
    Write-Host ""
    Write-Host "Error with Supabase CLI: $_" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Attempt 2: Using pg_dump (if PostgreSQL is installed)..." -ForegroundColor Cyan

$pgDumpPath = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($pgDumpPath) {
    try {
        $env:PGPASSWORD = $password
        $host = "aws-0-eu-west-1.pooler.supabase.com"
        $port = "6543"
        $user = "postgres.$projectRef"
        $database = "postgres"
        
        pg_dump -h $host -p $port -U $user -d $database -f $backupFile --no-owner --no-acl
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "Backup created successfully via pg_dump!" -ForegroundColor Green
            Write-Host "File: $backupFile" -ForegroundColor Cyan
            $fileSize = (Get-Item $backupFile).Length / 1MB
            Write-Host "Size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan
            Write-Host ""
            Remove-Item Env:\PGPASSWORD
            exit 0
        }
    } catch {
        Write-Host ""
        Write-Host "Error with pg_dump: $_" -ForegroundColor Yellow
        Write-Host ""
    } finally {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
} else {
    Write-Host ""
    Write-Host "pg_dump not found. PostgreSQL is not installed or not in PATH." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host ""
Write-Host "Failed to create backup automatically." -ForegroundColor Red
Write-Host ""
Write-Host "Alternative methods:" -ForegroundColor Yellow
Write-Host "1. Install Docker Desktop and try again" -ForegroundColor Cyan
Write-Host "2. Install PostgreSQL and use pg_dump directly" -ForegroundColor Cyan
Write-Host "3. Use online tools to connect to database" -ForegroundColor Cyan
Write-Host ""
Write-Host "Or create backup manually via SQL queries" -ForegroundColor Yellow
Write-Host "See BACKUP_INSTRUCTIONS.md for instructions" -ForegroundColor Yellow

exit 1
