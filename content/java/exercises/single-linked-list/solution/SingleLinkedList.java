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
        if (index < 0 || index >= size) {
            return -1;
        }
        Node cur = head;
        for (int i = 0; i < index; i++) {
            cur = next(cur);
        }
        return cur.value;
    }

    @Override
    public void add(int value) {
        Node node = new Node(value);
        if (head == null) {
            head = node;
        } else {
            Node cur = head;
            while (cur.next != null) {
                cur = next(cur);
            }
            cur.next = node;
        }
        size++;
    }

    @Override
    public void remove(int index) {
        if (index < 0 || index >= size) {
            return;
        }
        if (index == 0) {
            head = head.next;
        } else {
            Node prev = head;
            for (int i = 0; i < index - 1; i++) {
                prev = next(prev);
            }
            Node target = next(prev);
            prev.next = target.next;
        }
        size--;
    }

    @Override
    public int size() {
        return size;
    }

    private Node next(Node node) {
        System.out.print("Go to next node\n");
        return node.next;
    }
}
