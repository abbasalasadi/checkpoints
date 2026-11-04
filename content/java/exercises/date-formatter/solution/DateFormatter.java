import java.util.Calendar;
import java.util.Date;
import java.util.TimeZone;

public class DateFormatter {
    private static final String[] MONTHS = {
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    };

    private long date;
    private String formattedDate;
    private String format;

    public DateFormatter() {
        this(System.currentTimeMillis() / 1000L, "DD/MM/YYYY");
    }

    public DateFormatter(long date) {
        this(date, "DD/MM/YYYY");
    }

    public DateFormatter(long date, String format) {
        this.date = date;
        this.format = "DD/MM/YYYY";
        setFormat(format);
        convert();
    }

    public long getDate() {
        return date;
    }

    public void setDate(long date) {
        this.date = date;
        convert();
    }

    public String getFormat() {
        return format;
    }

    public void setFormat(String format) {
        if (format == null) {
            return;
        }
        String up = format.toUpperCase();
        if (up.equals("DD/MM/YYYY") || up.equals("DD.MM.YYYY") || up.equals("DD MONTH YYYY")) {
            this.format = format;
            convert();
        }
    }

    public String getFormattedDate() {
        return formattedDate;
    }

    private void convert() {
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        c.setTime(new Date(date * 1000L));
        String day = String.format("%02d", c.get(Calendar.DAY_OF_MONTH));
        String month = String.format("%02d", c.get(Calendar.MONTH) + 1);
        int year = c.get(Calendar.YEAR);
        String up = format.toUpperCase();
        if (up.equals("DD/MM/YYYY")) {
            formattedDate = day + "/" + month + "/" + year;
        } else if (up.equals("DD.MM.YYYY")) {
            formattedDate = day + "." + month + "." + year;
        } else {
            formattedDate = day + " " + MONTHS[c.get(Calendar.MONTH)] + " " + year;
        }
    }
}
