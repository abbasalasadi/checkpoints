public class TodoList {
    private Task[] tasks;
    private int capacity;

    public TodoList(int capacity);

    public void addTask(String description);

    public void setStatus(int index, TaskStatus status);

    public void setDescription(int index, String newDescription);

    public void displayTasks();
}
