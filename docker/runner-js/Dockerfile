# Our own runner image. It carries the upstream harness byte-identical, but not the 936 MB of
# Chromium the official module-js image ships: none of the 132 archived tests are DOM tests, so
# the harness's unconditional `puppeteer` import is satisfied by a stub.
#
# Built from a context assembled from content/js/ by the image build script (ported from
# js-checkpoints tools/build-image.mjs): app/{test.mjs,entrypoint.sh,tests/<slug>_test.js} and
# node_modules/puppeteer (= docker/runner-js/stub/puppeteer). Never build this directory directly.
# Same base and node source as upstream (alpine:3 + apk nodejs), so student code sees the same
# runtime it sees on the platform — minus Chromium.
FROM alpine:3

RUN apk add --no-cache nodejs

# /app holds the harness, the tests and the stub. Nothing here is writable at runtime: the
# container runs with a read-only rootfs and a tmpfs on /tmp.
WORKDIR /app
COPY app/ /app/
COPY node_modules/ /app/node_modules/

# Student files are mounted read-only at /jail/student by the runner.
RUN mkdir -p /jail/student && chmod 555 /app/entrypoint.sh

USER nobody
ENV NODE_ENV=production
ENTRYPOINT ["/app/entrypoint.sh"]
