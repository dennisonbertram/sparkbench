# Compatibility lab (first slice)

The optional lab verifies Sparkbench **schematics with KiCad 8+**. It does not change the local simulator or upload designs to proprietary services.

## What the report proves

| Check | Evidence | Not proven |
| --- | --- | --- |
| File accepted | Real `kicad-cli sch export netlist` succeeds and its output parses | Import into Flux, EasyEDA or Altium |
| Circuit preserved | Component references, values, footprint identifiers and physical-pin connection groups match | Footprint geometry, PCB routing, or correctness of every catalog pinout |
| Electrical rules | KiCad ERC JSON has no electrical findings | A safe or working physical board |
| Render generated | KiCad emits an SVG artifact | Visual quality, interactive editing or firmware execution |

Library lookup/mismatch findings are shown separately as warnings, **not** silently certified. Singleton nets are ignored: they do not connect two pins. Removing a wire from a connected pair still changes its connection group and fails. Interactive editing/running and all other destinations are explicitly **not tested**.

Reports contain a SHA-256 of canonical, sorted-key JSON for the **complete submitted project**, including firmware and metadata. They record tool version, timestamps and the source commit in CI. The UI verifies the returned hash, warns if the current project changed, and lets you download the JSON. This is snapshot identity, not a cryptographic attestation from a trusted service.

## Reference circuits and fault detection

`scripts/compatibility-fixtures.ts` contains three synthetic circuits: a battery/resistor/LED (including LED polarity), an ESP32 I²C OLED, and a deliberately reordered custom-module header. Expected physical endpoints and component values are hand-written separately from the exporter. They must not be regenerated to make a failing test pass. The module is synthetic, not a claim about a real product's pinout; OLED variants may swap their supply pins.

The cloud runner also swaps SDA/SCL in a valid schematic. KiCad must accept that file **and** the frozen connectivity comparison must reject it. Unit tests additionally inject a missing wire, short, reversed LED, and changed value. Ad-hoc UI jobs compare against Sparkbench's model instead of independent fixture expectations; they catch export loss but cannot independently certify the input model.

PCB/manufacturing fixtures and authenticated Flux/browser adapters are deferred. No Flux compatibility badge should be awarded from these results.

## Run locally

```sh
npm ci
npx vitest run tests/unit/compatibility.test.ts tests/unit/compatibility-jobs.test.ts
npm run compatibility:lab
```

Install KiCad 8+ (`kicad-cli` on PATH, or set `KICAD_CLI` to the executable). Unlike optional existing round-trip tests, this runner exits nonzero if KiCad is missing, incompatible, a check fails, or the negative control is not detected. Results go to `out/compatibility`: reports, expected/actual inventories, generated schematic/project, KiCad-derived netlist, ERC JSON and SVG renders. No user designs are used by the CI runner.

## Disposable cloud worker

The GitHub Actions workflow runs on PRs, pushes to main and manual dispatch. It builds Ubuntu 24.04 with **KiCad package `8.0.9-0~ubuntu24.04.1` from the signed KiCad 8 release PPA**. It fails rather than silently falling back to a different KiCad. Base OS/Node tags and transitive packages are not digest-locked; the exact observed KiCad version is recorded in each report.

```sh
docker build -f docker/compatibility.Dockerfile -t sparkbench-compatibility .
mkdir -p out/compatibility
docker run --rm --network none --memory 2g --cpus 2 --pids-limit 128 \
  --read-only --tmpfs /tmp:rw,nosuid,size=512m --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  -v "$PWD/out:/lab/out" sparkbench-compatibility
```

Build needs package-registry access; execution has no network, is non-root, has a read-only root filesystem and bounded memory/CPU/process count. Each KiCad command has a 45-second timeout/output limit. CI has a 25-minute hard timeout, explicit container cleanup and 14-day artifact retention. No persistent paid infrastructure is provisioned.

## Optional in-app jobs (trusted self-hosted deployment)

The API is **disabled by default**. On Linux/macOS, an operator can run the Vite server with:

```sh
export SPARKBENCH_COMPATIBILITY_ENABLED=1
export SPARKBENCH_COMPATIBILITY_TOKEN="$(openssl rand -hex 32)"
npm run dev -- --host 127.0.0.1
```

Retrieve the generated token securely from your operator environment; do not commit or log it. In a project choose **Export → Check compatibility**, enter the token, then explicitly send the snapshot. The token is memory-only. Every submission and report lookup requires the bearer token; `/api/compatibility/status` only reveals availability. This is a shared trusted-operator token, **not** multi-tenant user authentication. All token holders can retrieve a job if they know its random ID.

Limits: 2 MB request, 100 parts, 1,000 wires, 10-second body timeout, one active worker, three queued/read requests, 10 submissions per 10 minutes, 20 retained jobs, one-hour result TTL. Reports are held in memory and expired lazily on subsequent requests; a restart loses jobs. A worker is a fresh process with a restricted environment, 256 MB Node heap and 210-second wall timeout; its process group is killed on completion/timeout and its temporary directory is deleted. Custom-part registries are isolated per worker. Closing the UI does not cancel an accepted job. API jobs retain only report JSON, not SVG/schematic artifacts.

The process worker is **not a hardened hostile-input sandbox**. Do not expose this server directly to the public internet. The existing Vite API has other routes outside this lab's authentication boundary. For shared hosting use TLS, identity-aware reverse-proxy authentication, request/rate limits, container resource and filesystem/network isolation, and a dedicated lab instance with no cloud credentials. The included container is a batch CI worker, not a ready-made public multi-tenant API service. Abrupt host termination may leave temp files; use an ephemeral host/container filesystem or an operator cleanup policy.

Future hosted-tool adapters need isolated test accounts, explicit upload consent, synthetic fixtures by default, versioned evidence, hard timeouts and cleanup of uploaded projects/browser sessions. Keep `not-tested` until the actual destination importer has been exercised.
