public class ArmstrongNumber {
    public boolean isArmstrong(int number) {
        if (number < 0) return false;
        String digits = String.valueOf(number);
        int n = digits.length();
        long sum = 0;
        for (char d : digits.toCharArray()) sum += (long) Math.pow(d - '0', n);
        return sum == number;
    }
}
