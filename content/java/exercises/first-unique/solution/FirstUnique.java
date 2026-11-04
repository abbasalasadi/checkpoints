import java.util.HashMap;
import java.util.Map;

public class FirstUnique {
    public char findFirstUnique(String s) {
        if (s == null) return '_';
        Map<Character, Integer> count = new HashMap<>();
        for (char c : s.toCharArray()) count.merge(c, 1, Integer::sum);
        for (char c : s.toCharArray()) if (count.get(c) == 1) return c;
        return '_';
    }
}
