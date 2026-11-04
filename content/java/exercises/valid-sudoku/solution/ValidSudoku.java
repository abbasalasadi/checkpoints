public class ValidSudoku {
    public boolean isValidSudoku(char[][] board) {
        if (board == null || board.length != 9) return false;
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (int r = 0; r < 9; r++) {
            if (board[r] == null || board[r].length != 9) return false;
            for (int c = 0; c < 9; c++) {
                char v = board[r][c];
                if (v == '.') continue;
                if (v < '1' || v > '9') return false;
                if (!seen.add(v + "r" + r) || !seen.add(v + "c" + c) || !seen.add(v + "b" + (r / 3) + (c / 3))) return false;
            }
        }
        return true;
    }
}
