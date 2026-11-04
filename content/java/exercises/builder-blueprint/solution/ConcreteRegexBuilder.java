import java.util.ArrayList;
import java.util.List;

public class ConcreteRegexBuilder implements RegexBuilder {
    List<String> component = new ArrayList<>();

    @Override
    public void buildLiteral(String literal) {
        component.add(literal);
    }

    @Override
    public void buildAnyCharacter() {
        component.add(".");
    }

    @Override
    public void buildDigit() {
        component.add("\\d");
    }

    @Override
    public void buildWhitespace() {
        component.add("\\s");
    }

    @Override
    public void buildWordCharacter() {
        component.add("\\w");
    }

    @Override
    public Regex getResult() {
        return new Regex(component);
    }
}
