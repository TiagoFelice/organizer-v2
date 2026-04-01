import React from 'react';
import TaskTable from './TaskTable';

function TaskList({ tasks, users, onCompleteTask, onEditTask, onDeleteTask, getNextAssignee }) {
  return (
    <div id="taskList" className="task-list">
      <TaskTable
        tasks={tasks}
        users={users}
        onCompleteTask={onCompleteTask}
        onEditTask={onEditTask}
        onDeleteTask={onDeleteTask}
        getNextAssignee={getNextAssignee}
      />
    </div>
  );
}

export default TaskList;
