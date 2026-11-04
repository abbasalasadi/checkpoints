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
        int size = size();
        if (index < 0 || index >= size) {
            return -1;
        }
        Node cur;
        if (index <= size - 1 - index) {
            cur = head;
            for (int i = 0; i < index; i++) {
                cur = next(cur);
            }
        } else {
            cur = tail;
            for (int i = size - 1; i > index; i--) {
                cur = prev(cur);
            }
        }
        return cur.value;
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
    }

    @Override
    public void remove(int index) {
        int size = size();
        if (index < 0 || index >= size) {
            return;
        }
        Node target;
        if (index <= size - 1 - index) {
            target = head;
            for (int i = 0; i < index; i++) {
                target = next(target);
            }
        } else {
            target = tail;
            for (int i = size - 1; i > index; i--) {
                target = prev(target);
            }
        }
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
    }

    @Override
    public int size() {
        int size = 0;
        for (Node cur = head; cur != null; cur = cur.next) {
            size++;
        }
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
