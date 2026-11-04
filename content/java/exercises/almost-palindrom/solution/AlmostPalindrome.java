public class AlmostPalindrome {
    public static boolean isAlmostPalindrome(String s) {
        java.util.function.Predicate<String> isPalindrome = str -> {
            for (int i = 0, j = str.length() - 1; i < j; i++, j--) {
                if (str.charAt(i) != str.charAt(j)) {
                    return false;
                }
            }
            return true;
        };
        String t = s.toLowerCase();
        if (isPalindrome.test(t)) {
            return false;
        }
        for (int i = 0; i < t.length(); i++) {
            if (isPalindrome.test(t.substring(0, i) + t.substring(i + 1))) {
                return true;
            }
        }
        return false;
    }
}
