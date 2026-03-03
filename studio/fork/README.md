# Sim Studio Fork Build

This directory keeps the FlowIndex-maintained Sim Studio fork as patch files.

## Files

- `upstream.ref`: pinned upstream commit from `https://github.com/simstudioai/sim`
- `patches/*.patch`: ordered patch set applied via `git am`

## CI behavior

`deploy.yml` now builds these images before Sim Studio deploy:

- `us-central1-docker.pkg.dev/flowindex-mainnet/flowindex/simstudio-fork`
- `us-central1-docker.pkg.dev/flowindex-mainnet/flowindex/simstudio-fork-realtime`
- `us-central1-docker.pkg.dev/flowindex-mainnet/flowindex/simstudio-fork-migrations`

Each image gets both tags:

- `${GITHUB_SHA}`
- `latest`

## Update workflow

1. Update `upstream.ref` to target upstream commit.
2. Rebase or regenerate `patches/*.patch` against the new upstream.
3. Push to `main` to trigger build + deploy.
