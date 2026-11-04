public class TodoList {
    private Task[] tasks;
    private int capacity;
    private int size;

    public TodoList(int capacity) {
        this.capacity = capacity;
        this.tasks = new Task[capacity];
    }

    public void addTask(String description) {
        if (size < capacity) {
            tasks[size++] = new Task(description);
        }
    }

    public void setStatus(int index, TaskStatus status) {
        if (index >= 0 && index < size) {
            tasks[index].setStatus(status);
        }
    }

    public void setDescription(int index, String newDescription) {
        if (index >= 0 && index < size) {
            tasks[index].setDescription(newDescription);
        }
    }

    public void displayTasks() {
        System.out.print("Tasks:\n");
        for (int i = 0; i < size; i++) {
            System.out.print(String.format("%-34s| %s\n", tasks[i].getDescription(), tasks[i].getStatus()));
        }
    }
}
