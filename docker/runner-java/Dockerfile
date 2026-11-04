# Java runner image (V3 step 7c, docs/01_design/07_java_track.md §4).
#
# Same runtime as the official module-java image: Eclipse Temurin 21 on Alpine,
# Maven 3.9.12, and the upstream entrypoint.sh, pom.xml, TestRunnerMain and
# StopAfterFailureExtension byte-identical (content/java/sources/harness).
# Only the 45 checkpoint tests are carried (D31).
#
# Built from a context assembled from content/java/ by
# scripts/build-runner-images.mjs. Never build this directory directly.
FROM eclipse-temurin:21-jdk-alpine

ARG MAVEN_VERSION=3.9.12
RUN set -eux; \
    apk add --no-cache coreutils; \
    url="https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz"; \
    wget -q -O /tmp/maven.tgz "$url"; \
    wget -q -O /tmp/maven.tgz.sha512 "$url.sha512"; \
    echo "$(cut -d' ' -f1 /tmp/maven.tgz.sha512)  /tmp/maven.tgz" | sha512sum -c -; \
    mkdir -p /usr/share/maven; \
    tar -xzf /tmp/maven.tgz -C /usr/share/maven --strip-components=1; \
    ln -s /usr/share/maven/bin/mvn /usr/bin/mvn; \
    rm /tmp/maven.tgz /tmp/maven.tgz.sha512

COPY app/ /app/

# The offline Maven repository the entrypoint uses (-o -Dmaven.repo.local=/app/tests_utility).
# Upstream ships it pre-filled; here it is filled once at build time by running the
# exact submit command on one reference solution, so it holds what that command needs
# and nothing else. At run time there is no network.
RUN set -eux; \
    mkdir -p /tmp/warm/project/src/main/java /tmp/warm/project/src/test/java; \
    cp /app/warm/*.java /app/tests/StopAfterFailureExtension.java /app/tests/TestRunnerMain.java /tmp/warm/project/src/main/java/; \
    cp /app/tests/Factorial_test/*.java /tmp/warm/project/src/test/java/; \
    cp /app/pom.xml /tmp/warm/project/; \
    cd /tmp/warm/project; \
    printf 7 > .exit; \
    mvn -q -Dmaven.repo.local=/app/tests_utility -DskipTests test-compile exec:java@run-tests-via-main -DselectClass=FactorialTest || [ $? -eq 7 ]; \
    rm -rf /tmp/warm /app/warm /root/.m2; \
    chmod 555 /app/entrypoint.sh /app/run.sh

# Maven reads ~/.m2 for settings; nobody's home is the tmpfs.
ENV HOME=/tmp
RUN mkdir -p /jail/student
USER nobody
ENTRYPOINT ["/app/run.sh"]
