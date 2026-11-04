public class DoubleLinkedList implements LinkedList {
    private Node head;
    private Node tail;
    private int size;

    private class Node {
        int value;
        Node next;
        Node prev;

        Node(int value) {
            this.value = value;
        }
    }

    private Node find(int index) {
        if (index <= size - 1 - index) {
            Node cur = head;
            for (int i = 0; i < index; i++) {
                cur = next(cur);
            }
            return cur;
        }
        Node cur = tail;
        for (int i = size - 1; i > index; i--) {
            cur = prev(cur);
        }
        return cur;
    }

    @Override
    public int at(int index) {
        if (index < 0 || index >= size) {
            return -1;
        }
        return find(index).value;
    }

    @Override
    public void add(int value) {
        Node node = new Node(value);
        if (head == null) {
            head = node;
        } else {
            tail.next = node;
            node.prev = tail;
        }
        tail = node;
        size++;
    }

    @Override
    public void remove(int index) {
        if (index < 0 || index >= size) {
            return;
        }
        Node target = find(index);
        if (target.prev != null) {
            target.prev.next = target.next;
        } else {
            head = target.next;
        }
        if (target.next != null) {
            target.next.prev = target.prev;
        } else {
            tail = target.prev;
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

    private Node prev(Node node) {
        System.out.print("Go to previous node\n");
        return node.prev;
    }
}
