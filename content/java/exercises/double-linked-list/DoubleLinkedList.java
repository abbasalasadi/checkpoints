public class DoubleLinkedList implements LinkedList {
    private Node head;
    private Node tail;

    private class Node {
        int value;
        Node next;
        Node prev;

        Node(int value) {
            this.value = value;
        }
    }

    @Override
    public int at(int index) {
        // your code here
        return 0;
    }

    @Override
    public void add(int value) {
        // your code here
    }

    @Override
    public void remove(int index) {
        // your code here
    }

    @Override
    public int size() {
        // your code here
        return 0;
    }

    private Node next(Node node) {
        // your code here
        return null;
    }

    private Node prev(Node node) {
        // your code here
        return null;
    }
}
