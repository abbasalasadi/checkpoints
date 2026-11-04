import java.time.LocalDate;
import java.time.Period;
import java.time.format.DateTimeFormatter;

public class MonthlyPeriod {
    public String calculatePeriod(String startDate, String endDate) {
        LocalDate a, b;
        try {
            DateTimeFormatter f = DateTimeFormatter.ofPattern("yyyy-MM-dd");
            a = LocalDate.parse(startDate, f);
            b = LocalDate.parse(endDate, f);
        } catch (Exception e) {
            return "Error";
        }
        if (a.isAfter(b)) { LocalDate t = a; a = b; b = t; }
        Period p = Period.between(a, b);
        int y = p.getYears(), m = p.getMonths();
        String ys = y == 0 ? "" : y + (y == 1 ? " year" : " years");
        String ms = m == 0 ? "" : m + (m == 1 ? " month" : " months");
        if (!ys.isEmpty() && !ms.isEmpty()) return ys + " and " + ms;
        return ys + ms;
    }
}
