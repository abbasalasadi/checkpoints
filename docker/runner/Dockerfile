# Rust runner image — the sandbox student code executes in.
#
# Build-time network is used to populate the cargo registry; RUNTIME network is
# disabled (--network=none), which is why the one external dependency has to be
# baked in here rather than fetched on demand.
#
# Requirements settled in docs/04-runner.md:
#   - Rust >= 1.85: every exercise crate is edition 2024
#   - cargo on PATH inside test processes: four test crates spawn cargo
#     recursively via Command::new("cargo")
#   - rand 0.9.2 vendored: brackets_matching_test is the only crate with an
#     external dependency, and --network=none would otherwise fail it
#   - non-root: student code never runs as root

FROM rust:1.93-slim-bookworm

# Student code runs as this user, never root.
RUN useradd --create-home --shell /bin/bash --uid 10001 runner

# Populate the cargo registry so `cargo build --offline` resolves the only
# external dependency in the repository. Done as `runner` because the registry
# lives in that user's HOME and is read at runtime under the same uid.
USER runner
WORKDIR /home/runner

RUN set -eux; \
    mkdir -p /home/runner/.warm/src; \
    printf '%s\n' \
      '[package]' \
      'name = "warm"' \
      'version = "0.1.0"' \
      'edition = "2021"' \
      '' \
      '[dependencies]' \
      'rand = "0.9.2"' \
      > /home/runner/.warm/Cargo.toml; \
    echo 'fn main() {}' > /home/runner/.warm/src/main.rs; \
    cd /home/runner/.warm; \
    cargo fetch; \
    # Compile once so the crates are proven to build in this image. The build
    # artifacts are deliberately not shared with student projects: a shared
    # CARGO_TARGET_DIR makes the outer `cargo test` and the inner `cargo run`
    # contend on the same build-directory lock and hang.
    cargo build --offline --quiet; \
    rm -rf /home/runner/.warm/target

# Student projects are materialised here, on a disk-backed volume. Not tmpfs:
# a target/ directory is ~15 MB per exercise and tmpfs would spend RAM, which is
# the scarce resource on the VM (docs/04-runner.md).
WORKDIR /workspace

# Deliberately NOT set — see the lock-contention note above.
# ENV CARGO_TARGET_DIR=...

# Offline by default; every run passes --offline explicitly as well.
ENV CARGO_NET_OFFLINE=true

# A login shell re-reads /etc/profile and drops the rust toolchain from PATH,
# so `bash -lc cargo ...` fails with "command not found". The runner invokes
# cargo directly and is unaffected, but `make runner-shell` and any debugging
# session would hit it. Put the toolchain on the system-wide profile path.
USER root
RUN printf 'export PATH=/usr/local/cargo/bin:$PATH\n' > /etc/profile.d/rust.sh \
    && chmod 0644 /etc/profile.d/rust.sh

# Strip every setuid/setgid bit. The image ships 11 of them (su, mount, passwd,
# newgrp, ...) and student code needs none.
#
# This replaces --security-opt no-new-privileges, which is the usual defence but
# fails on Docker 29.x with "exec /usr/bin/sleep: operation not permitted" for a
# non-root user. Removing the bits is stronger anyway: it holds regardless of
# Docker version, and does not depend on a runtime flag being honoured.
RUN find / -xdev -perm /6000 -type f -exec chmod a-s {} + 2>/dev/null || true
USER runner

CMD ["/bin/bash"]
