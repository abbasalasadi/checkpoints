public class CircularLinkedList implements LinkedList {
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
        if (index < 0 || head == null) {
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
            node.next = node;
        } else {
            Node cur = head;
            while (cur.next != head) {
                cur = next(cur);
            }
            cur.next = node;
            node.next = head;
        }
        size++;
    }

    @Override
    public void remove(int index) {
        if (index < 0 || head == null) {
            return;
        }
        index = index % size;
        if (size == 1) {
            head = null;
        } else if (index == 0) {
            Node last = head;
            while (last.next != head) {
                last = last.next;
            }
            head = head.next;
            last.next = head;
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
