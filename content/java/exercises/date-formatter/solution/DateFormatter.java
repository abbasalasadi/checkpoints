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
        String[] months = {
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        };
        java.util.Calendar c = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));
        c.setTime(new Date(date * 1000L));
        String day = String.format("%02d", c.get(java.util.Calendar.DAY_OF_MONTH));
        String month = String.format("%02d", c.get(java.util.Calendar.MONTH) + 1);
        int year = c.get(java.util.Calendar.YEAR);
        String up = format.toUpperCase();
        if (up.equals("DD/MM/YYYY")) {
            formattedDate = day + "/" + month + "/" + year;
        } else if (up.equals("DD.MM.YYYY")) {
            formattedDate = day + "." + month + "." + year;
        } else {
            formattedDate = day + " " + months[c.get(java.util.Calendar.MONTH)] + " " + year;
        }
        return formattedDate;
    }
}
