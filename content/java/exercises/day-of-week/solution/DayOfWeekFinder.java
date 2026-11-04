import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

public class DayOfWeekFinder {
    public String findNextDayOfWeek(String startDate, String dayOfWeek) {
        try {
            LocalDate date = LocalDate.parse(startDate, DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            DayOfWeek day = DayOfWeek.valueOf(dayOfWeek.toUpperCase());
            return date.with(java.time.temporal.TemporalAdjusters.next(day)).toString();
        } catch (DateTimeParseException | IllegalArgumentException | NullPointerException e) {
            return "Error";
        }
    }
}
