// src/main/java/tools/TestRunnerMain.java

import org.junit.platform.launcher.*;
import org.junit.platform.launcher.core.*;
import org.junit.platform.engine.discovery.*;
import org.junit.platform.launcher.listeners.*;

import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.io.PrintStream;
import java.util.*;
import java.util.stream.Collectors;

public class TestRunnerMain {
    public static void main(String[] args) throws Exception {
        Map<String, List<String>> opts = parseArgs(args);
        Integer exitStatus = Integer.parseInt(readStringAndDelete(Paths.get(".exit")));
        // Pick classes to run:
        List<String> classes = new ArrayList<>(opts.getOrDefault("--select-class", List.of()));

        String exercise = System.getenv("EXERCISE");
        if (classes.isEmpty() && exercise != null && !exercise.isBlank()) {
            classes = List.of(exercise.endsWith("Test") ? exercise : exercise + "Test");
        }

        if (classes.isEmpty() && opts.getOrDefault("--select-package", List.of()).isEmpty()) {
            System.err.println("No tests selected. Use --select-class fqcn or --select-package pkg, or set EXERCISE.");
            System.exit(2);
        }

        LauncherDiscoveryRequestBuilder reqBuilder = LauncherDiscoveryRequestBuilder.request();

        for (String c : classes) reqBuilder.selectors(DiscoverySelectors.selectClass(c));
        for (String p : opts.getOrDefault("--select-package", List.of()))
            reqBuilder.selectors(DiscoverySelectors.selectPackage(p));

        for (String t : opts.getOrDefault("--include-tag", List.of()))
            reqBuilder.filters(TagFilter.includeTags(t));
        for (String t : opts.getOrDefault("--exclude-tag", List.of()))
            reqBuilder.filters(TagFilter.excludeTags(t));

        // You can tweak JUnit config here if needed:
        reqBuilder.configurationParameter("junit.jupiter.extensions.autodetection.enabled", "true");

        Launcher launcher = LauncherFactory.create();
        SummaryGeneratingListener summaryListener = new SummaryGeneratingListener();
        launcher.registerTestExecutionListeners(summaryListener);

        PrintStream backup = System.out;
        launcher.execute(reqBuilder.build());
        System.setOut(backup);

        TestExecutionSummary summary = summaryListener.getSummary();
        PrintWriter out = new PrintWriter(System.out);
        // Light banner toggle like your old --disable-banner
        boolean disableBanner = opts.containsKey("--disable-banner");
        if (!disableBanner) {
            out.println("== JUnit Platform Test Run ==");
        }
        summary.printTo(out);
        out.flush();

        // Print failures verbosely (similar to --details)
        if (summary.getFailures() != null && !summary.getFailures().isEmpty()) {
            System.out.println("\nFailures:");
            int i = 1;
            for (TestExecutionSummary.Failure f : summary.getFailures()) {
                System.out.println("  " + (i++) + ") " + displayName(f) );
                f.getException().printStackTrace(System.out);
            }
        }

        // non-zero exit on failures
        long failCount = summary.getTestsFailedCount() + summary.getContainersFailedCount();
        System.exit(failCount == 0 ? exitStatus : 1);
    }

    // --- helpers -------------------------------------------------------------

    private static Map<String, List<String>> parseArgs(String[] args) {
        Map<String, List<String>> map = new HashMap<>();
        String current = null;
        for (String a : args) {
            if (a.startsWith("--")) {
                current = a;
                map.putIfAbsent(current, new ArrayList<>());
            } else if (current != null) {
                map.get(current).add(a);
            }
        }
        return map;
    }

    private static String displayName(TestExecutionSummary.Failure f) {
        String id = Optional.ofNullable(f.getTestIdentifier())
                .map(TestIdentifier::getDisplayName)
                .orElse("<unknown>");
        return id + " -> " + f.getException().toString();
    }

    public static String readStringAndDelete(Path path) throws Exception {
        try {
            return Files.readString(path, StandardCharsets.UTF_8);
        } finally {
            try { Files.deleteIfExists(path); } catch (Exception ignore) {}
        }
    }
}
