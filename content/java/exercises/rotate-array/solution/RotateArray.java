public class RotateArray {
    public static Integer[] rotate(Integer[] arr, int rotationCount) {
        int n = arr.length;
        Integer[] res = new Integer[n];
        if (n == 0) {
            return res;
        }
        int k = ((rotationCount % n) + n) % n;
        for (int i = 0; i < n; i++) {
            res[(i + k) % n] = arr[i];
        }
        return res;
    }
}
