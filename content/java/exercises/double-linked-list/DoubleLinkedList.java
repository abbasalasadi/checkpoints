public class DoubleLinkedList implements LinkedList {
    private Node head;
    private Node tail;

    private class Node {
        int value;
        Node next;
        Node prev;
        ...
    }

    @Override
    public int at(int index) {
        // Implementation for accessing an element by its index
    }

    @Override
    public void add(int value) {
        // Implementation for adding an element at the end of the list
    }

    @Override
    public void remove(int index) {
        // Implementation for removing an element by its index
    }

    @Override
    public int size() {
        // Implementation for getting the size of the list
    }

    private Node next(Node node) {
        // Implementation for going to the next
    }

    private Node prev(Node node) {
        // Implementation for going to the prev
    }
}
