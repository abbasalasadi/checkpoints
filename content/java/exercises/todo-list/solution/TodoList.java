public class TodoList {
    private Task[] tasks;
    private int capacity;

    public TodoList(int capacity) {
        this.capacity = capacity;
        this.tasks = new Task[capacity];
    }

    public void addTask(String description) {
        for (int i = 0; i < capacity; i++) {
            if (tasks[i] == null) {
                tasks[i] = new Task(description);
                return;
            }
        }
    }

    public void setStatus(int index, TaskStatus status) {
        if (index >= 0 && index < capacity && tasks[index] != null) {
            tasks[index].setStatus(status);
        }
    }

    public void setDescription(int index, String newDescription) {
        if (index >= 0 && index < capacity && tasks[index] != null) {
            tasks[index].setDescription(newDescription);
        }
    }

    public void displayTasks() {
        System.out.print("Tasks:\n");
        for (int i = 0; i < capacity && tasks[i] != null; i++) {
            System.out.print(String.format("%-34s| %s\n", tasks[i].getDescription(), tasks[i].getStatus()));
        }
    }
}
