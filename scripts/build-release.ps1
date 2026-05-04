param(
  [string]$Version = "",
  [string]$ConfigPath = "config.toml",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (-not $Version) {
  $Version = (& node -e "require('dotenv').config(); console.log(require('./src/version').resolveAppVersion())").Trim()
}

if ($Version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
  throw "Version must match MAJOR.MINOR.PATCH. Got: $Version"
}

$resolvedConfigPath = Resolve-Path $ConfigPath -ErrorAction SilentlyContinue
if (-not $resolvedConfigPath) {
  throw "Config file not found: $ConfigPath. Copy config.toml.example to config.toml and fill non-secret settings."
}

$releaseRoot = Join-Path $repoRoot "release"
$releaseDir = Join-Path $releaseRoot $Version
if (Test-Path $releaseDir) {
  if (-not $Force) {
    throw "Release directory already exists: $releaseDir. Pass -Force to replace it."
  }
  Remove-Item -LiteralPath $releaseDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

function Copy-ReleaseItem {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$DestinationPath = ""
  )

  $target = if ($DestinationPath) { Join-Path $releaseDir $DestinationPath } else { Join-Path $releaseDir $Path }
  $parent = Split-Path -Parent $target
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  Copy-Item -LiteralPath $Path -Destination $target -Recurse -Force
}

Copy-ReleaseItem "package.json"
Copy-ReleaseItem "package-lock.json"
Copy-ReleaseItem "README.md"
Copy-ReleaseItem "config.toml.example"
Copy-ReleaseItem ".env.example"
Copy-ReleaseItem "update.sh"
Copy-ReleaseItem "src"
Copy-ReleaseItem "public"
Copy-ReleaseItem "icons8-download-cute-color-16.png"
Copy-ReleaseItem "icons8-download-cute-color-32.png"
Copy-ReleaseItem "icons8-download-cute-color-96.png"
Copy-ReleaseItem "favico.png"
Copy-ReleaseItem "scripts/wait-for-health.sh"
Copy-ReleaseItem "scripts/nas-start.sh"
Copy-ReleaseItem "scripts/nas-stop.sh"
Copy-ReleaseItem "scripts/diagnostics-summary.js"
Copy-Item -LiteralPath $resolvedConfigPath -Destination (Join-Path $releaseDir "config.toml") -Force

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$installDoc = @"
# TrackerView ${Version}: NAS local install

Target directory:

~~~sh
/volume1/docker/trackerview
~~~

This package runs TrackerView directly on NAS Node.js, without Docker. Runtime config is `config.toml`; secrets are in `.env`.

First install from GitHub:

~~~sh
mkdir -p /volume1/docker
cd /volume1/docker
rm -rf trackerview
git clone -b main https://github.com/poznik/trackerview.git trackerview
cd /volume1/docker/trackerview
cp /path/to/release/${Version}/config.toml ./config.toml
cp /path/to/release/${Version}/.env.example ./.env
vi .env
npm ci --omit=dev
sh scripts/nas-start.sh
sh scripts/wait-for-health.sh http://127.0.0.1:3000 90
~~~

If the app directory already contains a Git checkout:

~~~sh
cd /volume1/docker/trackerview
sh scripts/nas-stop.sh || true
git fetch origin main
git checkout -B main origin/main
git reset --hard origin/main
cp /path/to/release/${Version}/config.toml ./config.toml
[ -f .env ] || cp /path/to/release/${Version}/.env.example ./.env
npm ci --omit=dev
sh scripts/nas-start.sh
sh scripts/wait-for-health.sh http://127.0.0.1:3000 90
~~~

The in-app Update button runs:

~~~sh
/volume1/docker/trackerview/update.sh
~~~

It fetches `origin/main`, installs production dependencies, restarts the local Node.js service, and waits for `/api/health`.

Summarize diagnostic logs:

~~~sh
node scripts/diagnostics-summary.js logs/trackerview.log
~~~
"@

[System.IO.File]::WriteAllText((Join-Path $releaseDir "INSTALL_NAS.md"), $installDoc + [Environment]::NewLine, $utf8NoBom)

$manifest = [ordered]@{
  version = $Version
  deployment = "nas-local"
  app_dir = "/volume1/docker/trackerview"
  repository = "https://github.com/poznik/trackerview.git"
  branch = "main"
  start_script = "scripts/nas-start.sh"
  stop_script = "scripts/nas-stop.sh"
  update_script = "update.sh"
  files = @(
    "package.json",
    "package-lock.json",
    "src/",
    "public/",
    "scripts/wait-for-health.sh",
    "scripts/nas-start.sh",
    "scripts/nas-stop.sh",
    "scripts/diagnostics-summary.js",
    "update.sh",
    "config.toml",
    "config.toml.example",
    ".env.example",
    "README.md",
    "INSTALL_NAS.md",
    "manifest.json"
  )
}

[System.IO.File]::WriteAllText(
  (Join-Path $releaseDir "manifest.json"),
  (($manifest | ConvertTo-Json -Depth 4) + [Environment]::NewLine),
  $utf8NoBom
)

Write-Host "Release created: $releaseDir"
Write-Host "Upload config.toml/.env values from this package after cloning https://github.com/poznik/trackerview.git on NAS."
Write-Host "Start on NAS: cd /volume1/docker/trackerview && npm ci --omit=dev && sh scripts/nas-start.sh"
