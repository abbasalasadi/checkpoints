public class SingleLinkedList implements LinkedList {
    private Node head;
    private int size;

    private class Node {
        int value;
        Node next;

        Node(int value) {
            this.value = value;
            this.next = null;
        }
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
        // Implementation for accessing an element by its index
    }

    private Node next(Node node) {
        // Print the message "Go to next node"
    }
}
