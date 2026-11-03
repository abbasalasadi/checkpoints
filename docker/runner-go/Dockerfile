# The Go checkpoint runner (docker/runner-go). The build context is assembled
# from content/go/ by the image build script (ported from go-checkpoints
# tools/build-image.mjs; context layout below) —
# never built straight from this directory, because solutions/ and tests/ are
# scattered one-per-exercise in content/ and have to be gathered first.
#
# The point of the whole file is the `go build ./...` near the end: it leaves a
# warm GOCACHE in the image, which is worth 23x on run time and 3.7x on memory
# against a cold one. See docs/04-execution.md §2.
FROM golang:1.25.12-alpine

# Pinned to what ghcr.io/01-edu/module-go runs, so a student meets the same
# compiler and the same error text they will meet on the real checkpoint.
ENV GOTOOLCHAIN=local \
    GOPATH=/go \
    GOCACHE=/gocache \
    GOFLAGS=-mod=mod \
    CGO_ENABLED=0

RUN apk add --no-cache git

# What the student's module will look like: baked so nothing has to be resolved
# at run time, when there is no network. It must also exist *at build time* — the
# harness declares `replace student => ../piscine-go`, so every go command in
# /test-go reads /piscine-go/go.mod, including `go mod download`.
COPY piscine-go-template /piscine-go-template
COPY piscine-go-seed     /piscine-go

# The harness: lib/ verbatim from the image, solutions/ and tests/ reassembled
# from content/ — which is how the four exercises upstream cannot grade get a
# reference program at all.
WORKDIR /test-go
COPY test-go/go.mod test-go/go.sum ./
RUN go mod download
COPY test-go/lib       ./lib
COPY test-go/solutions ./solutions
COPY test-go/tests     ./tests
# What content/ hashed to when this image was built, so a deploy can refuse to
# ship an image that would grade with stale tests — tools/verify-image.mjs.
COPY test-go/content.sha256.json ./content.sha256.json

# The two gates, same versions the tester image installs.
RUN GOPRIVATE='github.com/01-edu/*' go install github.com/01-edu/rc@v0.4.0 \
 && go install mvdan.cc/gofumpt@v0.9.2

# Warm the cache — the point of the whole file. `go build ./...` alone misses the
# test programs, which are main packages under ./tests, and those are most of the
# link time. /piscine-go currently holds the reference solutions so they compile.
RUN go build ./... \
 && go build -o /dev/null ./tests/... \
 && (cd /piscine-go && go build ./...) \
 && chmod -R 0777 /gocache

# From here on nothing may reach the network: a run that tries to fetch a module
# is a bug in this image, and should fail loudly rather than hang against
# --network none.
ENV GOPROXY=off GOFLAGS=-mod=mod

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
