# Check arduino-cli and compile firmware
$outFile = "c:\Users\emman\Downloads\Pimisa\pimisa-voucher-system\firmware\compile_result.txt"

$found = Get-Command arduino-cli -ErrorAction SilentlyContinue
if ($found) {
    "FOUND: $($found.Source)" | Set-Content $outFile
    $ver = arduino-cli version 2>&1 | Out-String
    $ver | Add-Content $outFile
    
    $cores = arduino-cli core list 2>&1 | Out-String
    "CORES:`n$cores" | Add-Content $outFile
    
    $libs = arduino-cli lib list 2>&1 | Out-String
    "LIBS:`n$libs" | Add-Content $outFile
    
    # Try compile
    $compile = arduino-cli compile --fqbn esp32:esp32:esp32 "c:\Users\emman\Downloads\Pimisa\pimisa-voucher-system\firmware\main_pimisa_dispenser" 2>&1 | Out-String
    "COMPILE:`n$compile" | Add-Content $outFile
} else {
    "NOT_FOUND" | Set-Content $outFile
}
