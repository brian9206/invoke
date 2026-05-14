import fs from 'fs/promises'
import { exec } from '../utils'
import { Pipeline } from '../types'

// ---------------------------------------------------------------------------
// dotnet-csharp pipeline
//
// Compiles the user's .NET C# project to a self-contained NativeAOT binary
// targeting linux-musl-x64.  The user's project must reference Invoke.SDK
// (e.g. via PackageReference or ProjectReference).
//
// Expected layout under /output/source/:
//   *.csproj  — the user's project file
//   **/*.cs   — user source files
//
// Produces:
//   /output/artifacts/program  — the native executable
// ---------------------------------------------------------------------------

const nugetConfig = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <add key="LocalPackages" value="/opt/packages/nuget" />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
</configuration>
`

const env = {
  MSBUILDDISABLENODEREUSE: '1',
  DOTNET_CLI_HOME: '/output/tmp',
  NUGET_PACKAGES: '/output/tmp/.nuget/packages'
}

const pipeline: Pipeline = {
  name: 'dotnet-csharp',
  stages: [
    // ── Stage: publish NativeAOT binary ─────────────────────────────────────
    {
      name: 'publish',
      run: async () => {
        await fs.writeFile('/output/source/nuget.config', nugetConfig, { encoding: 'utf-8' })
        await exec(
          [
            'dotnet',
            'publish',
            '--configuration',
            'Release',
            '--runtime',
            'linux-musl-x64',
            '--disable-build-servers',
            '-p:UseSharedCompilation=false',
            '--self-contained',
            '-p:PublishAot=true',
            '-p:InvariantGlobalization=true',
            '-p:StripSymbols=true',
            '-p:AssemblyName=program',
            '--output',
            '/output/artifacts'
          ],
          {
            cwd: '/output/source',
            env
          }
        )

        // Set executable permissions on the output binary
        await fs.chmod('/output/artifacts/program', 0o777)
      }
    }
  ]
}

export default pipeline
