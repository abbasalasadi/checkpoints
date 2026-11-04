public class SpiralMatrix {
    public int[][] generateMatrix(int n) {
        int[][] m = new int[n][n];
        int top = 0, bottom = n - 1, left = 0, right = n - 1;
        int v = 1;
        while (top <= bottom && left <= right) {
            for (int c = left; c <= right; c++) {
                m[top][c] = v++;
            }
            top++;
            for (int r = top; r <= bottom; r++) {
                m[r][right] = v++;
            }
            right--;
            if (top <= bottom) {
                for (int c = right; c >= left; c--) {
                    m[bottom][c] = v++;
                }
                bottom--;
            }
            if (left <= right) {
                for (int r = bottom; r >= top; r--) {
                    m[r][left] = v++;
                }
                left++;
            }
        }
        return m;
    }
}
