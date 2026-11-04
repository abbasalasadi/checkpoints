# The Cloud Run image is the *existing* Java runner image plus an HTTP wrapper,
# as for Go and JS: the graded content (official harness, tests, offline Maven
# repository, entrypoint.sh) is byte-identical to the image
# tools/java-image-check.sh verifies. This layer adds a server and nothing else.
ARG BASE=java-checkpoints-runner:dev
FROM ${BASE}

# The base image ends on USER nobody, so root is needed to add anything.
USER root

# Built with the JDK already in the base image; no new dependencies.
COPY Wrapper.java /wrapper/Wrapper.java
RUN javac -d /wrapper /wrapper/Wrapper.java && rm /wrapper/Wrapper.java

# Per-request scratch. Cloud Run's filesystem is in-memory, so this counts
# against --memory; wiped after every request.
RUN mkdir -p /work && chown nobody /work && chmod 700 /work

USER nobody
ENV PORT=8080
EXPOSE 8080

# Replaces the base ENTRYPOINT: the wrapper runs /app/run.sh once per request,
# with STUDENT_DIR and WORK_DIR pointed at that request's directory.
ENTRYPOINT ["java", "-Xss512k", "-XX:+UseSerialGC", "-Xmx48m", "-cp", "/wrapper", "Wrapper"]
