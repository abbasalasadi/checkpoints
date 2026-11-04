import java.text.SimpleDateFormat;
import java.util.Date;

public class DateFormatter {
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
    }

    public long getDate() {
        return date;
    }

    public void setDate(long date) {
        this.date = date;
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
        }
    }

    public String getFormattedDate() {
        String up = format.toUpperCase();
        String pattern;
        if (up.equals("DD/MM/YYYY")) {
            pattern = "dd/MM/y";
        } else if (up.equals("DD.MM.YYYY")) {
            pattern = "dd.MM.y";
        } else {
            pattern = "dd MMMM y";
        }
        SimpleDateFormat f = new SimpleDateFormat(pattern, java.util.Locale.ENGLISH);
        f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        formattedDate = f.format(new Date(date * 1000L));
        return formattedDate;
    }
}
