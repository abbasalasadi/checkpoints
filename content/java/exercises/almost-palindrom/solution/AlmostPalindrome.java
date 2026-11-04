public class AlmostPalindrome {
    public static boolean isAlmostPalindrome(String s) {
        String t = s.toLowerCase();
        if (isPalindrome(t)) {
            return false;
        }
        for (int i = 0; i < t.length(); i++) {
            if (isPalindrome(t.substring(0, i) + t.substring(i + 1))) {
                return true;
            }
        }
        return false;
    }

    private static boolean isPalindrome(String s) {
        for (int i = 0, j = s.length() - 1; i < j; i++, j--) {
            if (s.charAt(i) != s.charAt(j)) {
                return false;
            }
        }
        return true;
    }
}
