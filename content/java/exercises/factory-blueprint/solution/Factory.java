public class Factory {
    @SuppressWarnings("unchecked")
    public <T extends Product> T createProduct(String type) {
        if ("A".equals(type)) return (T) new ConcreteProductA();
        if ("B".equals(type)) return (T) new ConcreteProductB();
        return null;
    }
}
