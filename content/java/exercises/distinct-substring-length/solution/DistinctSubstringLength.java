import java.util.HashMap;
import java.util.Map;

public class DistinctSubstringLength {
    public int maxLength(String s) {
        Map<Character, Integer> last = new HashMap<>();
        int best = 0;
        int start = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            Integer seen = last.get(c);
            if (seen != null && seen >= start) {
                start = seen + 1;
            }
            last.put(c, i);
            best = Math.max(best, i - start + 1);
        }
        return best;
    }
}
