#!/bin/sh

set -e

mkdir -p project/src/main/java
mkdir -p project/src/test/java

# ! support both variables CODE_EDITOR_RUN_ONLY and EXAM_RUN_ONLY
CODE_EDITOR_RUN_ONLY="${CODE_EDITOR_RUN_ONLY:-$EXAM_RUN_ONLY}"
# ! support both variables CODE_EDITOR_MODE and EXAM_MODE
CODE_EDITOR_MODE="${CODE_EDITOR_MODE:-$EXAM_MODE}"

if test "$CODE_EDITOR_RUN_ONLY" = true; then
	cd ./student/
	cp -rf ./*.java ../project/src/main/java
	cd ../project/src/main/java
	javac ./*.java -d build
	java -cp build ExerciseRunner
	exit
fi

if [ -z "$EDITOR_FILES" ]; then
	cp -rf "./student/${EXERCISE}/"*.java ./project/src/main/java
else
	cd ./student/
	# shellcheck disable=SC2086
	# shellcheck disable=SC2046
	cp -rf $(echo $EDITOR_FILES | tr ',' ' ') ../project/src/main/java
	cd -
fi

cp -rf "/app/tests/StopAfterFailureExtension.java" ./project/src/main/java

cp -rf "/app/tests/TestRunnerMain.java" ./project/src/main/java

cp -rf "/app/tests/${EXERCISE}_test"/*.java ./project/src/test/java

cp /app/pom.xml ./project

cd project

EXIT_STATUS="$(shuf -i 100-200 -n 1)"
printf "%s" "$EXIT_STATUS" >.exit

set +e
mvn     -q \
	-o \
	-Dmaven.repo.local=/app/tests_utility \
	-DskipTests \
	test-compile exec:java@run-tests-via-main \
	-DselectClass="${EXERCISE}Test"

if [ "$?" -eq "$EXIT_STATUS" ]; then
	exit 0
else
	exit 1
fi
