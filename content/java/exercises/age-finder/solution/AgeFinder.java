import java.time.LocalDate;
import java.time.Period;
import java.time.format.DateTimeFormatter;

public class AgeFinder {
    public int calculateAge(String date) {
        try {
            LocalDate birth = LocalDate.parse(date, DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            LocalDate now = LocalDate.now();
            if (birth.isAfter(now)) return -1;
            return Period.between(birth, now).getYears();
        } catch (Exception e) {
            return -1;
        }
    }
}
