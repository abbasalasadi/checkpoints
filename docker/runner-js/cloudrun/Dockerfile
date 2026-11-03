# The Cloud Run image is the *existing* runner image plus an HTTP wrapper.
#
# Layering rather than rebuilding is deliberate: the graded content — the
# upstream harness, the 132 tests, the puppeteer stub, entrypoint.sh — is
# byte-identical to the image `make image` already builds from content/. This
# layer adds a server and nothing else, so a Cloud Run verdict and a local
# Docker verdict come from the same bits.
ARG BASE=js-checkpoints-runner:latest
FROM ${BASE}

# The base image ends on USER nobody, so root is needed to add anything.
USER root

COPY server.mjs /wrapper/server.mjs

# Per-request scratch. Cloud Run's filesystem is in-memory, so this counts
# against --memory; the student's files are small and wiped per request.
# Owned by nobody because that is who the wrapper runs as.
RUN mkdir -p /work && chown nobody /work && chmod 700 /work

# Back to the unprivileged user the base image chose. The Cloud Run sandbox
# subsumes CapDrop and no-new-privileges (docs/10-cloud-run.md §7), but running
# student code as root would still be a needless downgrade from today.
USER nobody

# Cloud Run sends traffic to $PORT.
ENV PORT=8080
EXPOSE 8080

# Replaces the base image's ENTRYPOINT: the wrapper invokes entrypoint.sh itself,
# once per request, with STUDENT_DIR pointed at that request's directory.
ENTRYPOINT ["node", "/wrapper/server.mjs"]
