# Starts the Spring Boot backend with the local profile (config/application-local.yml).
# Lombok in Spring Boot 3.2 cannot run on JDK 26, so this pins a JDK 21.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (Test-Path 'C:\Program Files\JetBrains\IntelliJ IDEA Community Edition 2025.2.6.1\jbr') {
    $jdk = 'C:\Program Files\JetBrains\IntelliJ IDEA Community Edition 2025.2.6.1\jbr'
} else {
    $jdk = Get-ChildItem 'C:\Program Files\JetBrains' -Directory -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName 'jbr' } |
      Where-Object { Test-Path (Join-Path $_ 'release') } |
      Where-Object { (Get-Content (Join-Path $_ 'release') -Raw) -match 'JAVA_VERSION="21' } |
      Select-Object -First 1
}
if (-not $jdk) { throw 'No JDK 21 found. Install Temurin 21 or set JAVA_HOME to a JDK 17/21.' }
$env:JAVA_HOME = $jdk

$knownMvn = 'C:\Program Files\JetBrains\IntelliJ IDEA Community Edition 2025.2.6.1\plugins\maven\lib\maven3\bin\mvn.cmd'
if (Test-Path $knownMvn) {
    $mvnPath = $knownMvn
} else {
    $mvn = Get-ChildItem 'C:\Program Files\JetBrains' -Recurse -Filter mvn.cmd -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match 'maven3\\bin' } | Select-Object -First 1
    if (-not $mvn) { throw 'Maven not found (expected the IntelliJ bundled Maven).' }
    $mvnPath = $mvn.FullName
}

$env:SPRING_PROFILES_ACTIVE = 'local'
Write-Host "JAVA_HOME = $jdk"
& $mvnPath -B spring-boot:run
