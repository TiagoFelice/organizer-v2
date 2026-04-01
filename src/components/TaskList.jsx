import React from 'react';
import TaskCard from './TaskCard';

function TaskList({ tasks, users, onCompleteTask, onEditTask, onDeleteTask, getNextAssignee }) {
  if (tasks.length === 0) {
    return (
      <div id="taskList" className="task-list">
        <div className="loading">
          Nenhuma tarefa encontrada. Crie sua primeira tarefa!
        </div>
      </div>
    );
  }

  // Sort tasks by ID for consistent order
  const sortedTasks = [...tasks].sort((a, b) => {
    return (a.id || '').localeCompare(b.id || '');
  });

  return (
    <div id="taskList" className="task-list">
      {sortedTasks.map(task => (
        <TaskCard
          key={task.id}
          task={task}
          users={users}
          onComplete={onCompleteTask}
          onEdit={onEditTask}
          onDelete={onDeleteTask}
          getNextAssignee={getNextAssignee}
        />
      ))}
    </div>
  );
}

export default TaskList;
