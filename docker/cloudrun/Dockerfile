# The Cloud Run image is the *existing* runner image plus an HTTP wrapper.
#
# Layering rather than rebuilding keeps the toolchain, the vendored rand crate,
# the stripped setuid bits and the runner user byte-identical to the image the
# VM grades with — so a Cloud Run verdict and a VM verdict come from the same
# bits. Only the entrypoint differs.
#
# The wrapper is Go because this image carries no Go and no Node: a static
# binary is built in a throwaway stage and copied in, adding a compiler to
# nothing. (go-checkpoints builds its wrapper in-place because that image
# already has the Go toolchain; js-checkpoints writes its in Node for the same
# reason. The contract is identical in all three.)
# Declared BEFORE the first FROM on purpose. An ARG used in a FROM must be
# global: declared between the stages it belongs to the builder's scope, and the
# second FROM then resolves it to empty ("base name should not be blank").
ARG BASE=rust-checkpoints-runner:latest

FROM golang:1.23-alpine AS wrapper
WORKDIR /src
COPY main.go .
RUN go mod init wrapper >/dev/null 2>&1 \
 && CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/runner-wrapper .

FROM ${BASE}

USER root
COPY --from=wrapper /out/runner-wrapper /usr/local/bin/runner-wrapper

# Per-request scratch. Cloud Run's filesystem is in-memory, so a target/ built
# here counts against --memory — which is why this service is sized larger than
# the other two.
RUN mkdir -p /work && chown 10001:10001 /work && chmod 0700 /work

# Back to the unprivileged user the base image chose. Student code has never run
# as root here and does not start now.
USER runner

ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/runner-wrapper"]
