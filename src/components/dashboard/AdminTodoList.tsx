import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAdminTodos } from "@/hooks/useAdminTodos";
import { Plus, Trash2, ListTodo, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminTodoList() {
  const { todos, isLoading, addTodo, toggleTodo, deleteTodo } = useAdminTodos();
  const [newTitle, setNewTitle] = useState("");

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    addTodo.mutate(newTitle.trim());
    setNewTitle("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAdd();
    }
  };

  const pendingCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.filter((t) => t.completed).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ListTodo className="h-5 w-5 text-primary" />
          To-Do List
          {pendingCount > 0 && (
            <span className="ml-auto text-sm font-normal text-muted-foreground">
              {pendingCount} da fare
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add new todo */}
        <div className="flex gap-2">
          <Input
            placeholder="Aggiungi attività..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleAdd}
            disabled={!newTitle.trim() || addTodo.isPending} aria-label="Caricamento">
            {addTodo.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Todo list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : todos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessuna attività. Aggiungine una!
          </p>
        ) : (
          <ul className="space-y-2">
            {todos.map((todo) => (
              <li
                key={todo.id}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-md border transition-colors",
                  todo.completed
                    ? "bg-muted/50 border-transparent"
                    : "bg-background border-border hover:border-primary/30"
                )}
              >
                <Checkbox
                  checked={todo.completed}
                  onCheckedChange={(checked) =>
                    toggleTodo.mutate({ id: todo.id, completed: !!checked })
                  }
                  disabled={toggleTodo.isPending}
                />
                <span
                  className={cn(
                    "flex-1 text-sm",
                    todo.completed && "line-through text-muted-foreground"
                  )}
                >
                  {todo.title}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteTodo.mutate(todo.id)}
                  disabled={deleteTodo.isPending}
                 aria-label="Elimina">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Summary */}
        {completedCount > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            {completedCount} completat{completedCount === 1 ? "a" : "e"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
