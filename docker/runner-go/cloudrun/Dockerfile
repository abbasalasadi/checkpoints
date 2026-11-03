# The Cloud Run image is the *existing* runner image plus an HTTP wrapper.
#
# Layering rather than rebuilding is deliberate: the graded content — lib/,
# solutions/, tests/, the warm GOCACHE, the two gates, entrypoint.sh — is
# byte-identical to the image `make verify-image` already checks against
# content/. This layer adds a server and nothing else, so a Cloud Run verdict
# and a local Docker verdict come from the same bits.
ARG BASE=go-checkpoints-runner:latest
FROM ${BASE}

# Built with the toolchain already in the base image; no new dependencies.
COPY main.go /wrapper/main.go
RUN cd /wrapper \
 && go mod init wrapper >/dev/null 2>&1 \
 && go build -o /usr/local/bin/runner-wrapper . \
 && rm -rf /wrapper

# Per-request scratch. Cloud Run's filesystem is in-memory, so this counts
# against --memory; the student's files are small and wiped per request.
RUN mkdir -p /work

# Cloud Run sends traffic to $PORT.
ENV PORT=8080
EXPOSE 8080

# Replaces the base image's ENTRYPOINT: the wrapper invokes entrypoint.sh itself,
# once per request, with STUDENT_DIR pointed at that request's directory.
ENTRYPOINT ["/usr/local/bin/runner-wrapper"]
