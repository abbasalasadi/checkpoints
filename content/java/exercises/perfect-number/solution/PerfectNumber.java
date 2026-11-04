public class PerfectNumber {
    public boolean isPerfectNumber(int number) {
        if (number <= 1) return false;
        long sum = 1;
        for (long i = 2; i * i <= number; i++) {
            if (number % i == 0) {
                sum += i;
                long other = number / i;
                if (other != i) sum += other;
            }
        }
        return sum == number;
    }
}
