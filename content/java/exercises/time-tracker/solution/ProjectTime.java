import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;

public class ProjectTime {
    private String startTime;
    private String endTime;
    private float hoursLogged;

    public ProjectTime(String start, String end) {
        this.startTime = start;
        this.endTime = end;
    }

    public void setStartTime(String startTime) {
        this.startTime = startTime;
    }
    public void setEndTime(String endTime) {
        this.endTime = endTime;
    }

    public String getStartTime() {
        return startTime;
    }
    public String getEndTime() {
        return endTime;
    }

    public String getHoursLogged() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm");
        f.setLenient(false);
        f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        try {
            Date s = f.parse(startTime);
            Date e = f.parse(endTime);
            long minutes = (e.getTime() - s.getTime()) / 60000L;
            hoursLogged = minutes < 0 ? -1 : minutes;
        } catch (ParseException | NullPointerException ex) {
            hoursLogged = -1;
        }
        if (hoursLogged < 0) {
            return "-1";
        }
        long m = (long) hoursLogged;
        if (m < 120) {
            return m + " m";
        }
        long h = m / 60;
        if (h < 120) {
            return h + " h";
        }
        long d = h / 24;
        if (d < 120) {
            return d + " d";
        }
        return (d / 30) + " mo";
    }
}
