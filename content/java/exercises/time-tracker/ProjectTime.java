import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;

public class ProjectTime {
    private String startTime;
    private String endTime;
    private float hoursLogged;

    public ProjectTime(String start, String end);

    public void setStartTime();
    public void setEndTime();

    public String getStartTime();
    public String getEndTime();

    public String getHoursLogged();
}
