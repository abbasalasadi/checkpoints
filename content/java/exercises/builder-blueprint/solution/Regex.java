import java.util.ArrayList;
import java.util.List;

public class Regex {
    private StringBuilder pattern;

    public Regex() {
        this(new ArrayList<>());
    }

    public Regex(List<String> component) {
        pattern = new StringBuilder();
        for (String c : component) {
            pattern.append(c);
        }
    }

    public String getPattern() {
        return pattern.toString();
    }

    @Override
    public String toString() {
        return getPattern();
    }
}
