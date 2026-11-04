public class ReverseArray {
    public static Integer[] reverse(Integer[] arr) {
        Integer[] res = new Integer[arr.length];
        for (int i = 0; i < arr.length; i++) {
            res[i] = arr[arr.length - 1 - i];
        }
        return res;
    }
}
