public class UnitConverter {
    public static String convert(String[] args) {
        if (args == null || args.length != 3) {
            return "ERROR";
        }
        double v;
        try {
            v = Double.parseDouble(args[2]);
        } catch (NumberFormatException e) {
            return "ERROR";
        }
        String pair = args[0].toLowerCase() + ">" + args[1].toLowerCase();
        double r;
        switch (pair) {
            case "fahrenheit>celsius": r = (v - 32) * 5 / 9; break;
            case "celsius>fahrenheit": r = v * 9 / 5 + 32; break;
            case "kilometers>miles": r = v * 0.621371; break;
            case "miles>kilometers": r = v * 1.60934; break;
            case "pounds>kilograms": r = v * 0.45359237; break;
            default: return "ERROR";
        }
        return String.format(java.util.Locale.US, "%.2f", r);
    }
}
